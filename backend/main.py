"""
Agentic Workflow Builder & Orchestrator — FastAPI Backend v2.0

DB initialisation strategy (belt-and-suspenders):
  1. Module-level call to init_db() — runs immediately on import, before any
     request can arrive.  Covers plain `python main.py` and most ASGI servers.
  2. @asynccontextmanager lifespan — runs on server startup (FastAPI standard).
  3. Startup event — legacy fallback for older Starlette/uvicorn combos.

All three are idempotent ("CREATE TABLE IF NOT EXISTS" + "ON CONFLICT DO NOTHING").
"""

import json
import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import db first — single source of truth for all paths
from db import DB_PATH, REPO_ROOT, DATA_DIR, OUTPUT_DIR, get_conn

from routers import agents, workflows, models, chat, logs, skills

# ── Additional directories ────────────────────────────────────────────────────
UPLOAD_DIR = DATA_DIR / "uploads"
SKILLS_DIR = DATA_DIR / "skills"
TOOLS_DIR  = DATA_DIR / "tools"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _col_names(conn: sqlite3.Connection, table: str) -> list:
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]


# ── DB initialisation ─────────────────────────────────────────────────────────

def init_db() -> None:
    """Create all tables, apply migrations, seed demo data.  Always idempotent."""

    for d in (DATA_DIR, UPLOAD_DIR, SKILLS_DIR, TOOLS_DIR):
        d.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    c = conn.cursor()

    # ── Schema ────────────────────────────────────────────────────────────────
    c.executescript("""
        CREATE TABLE IF NOT EXISTS agents (
            id                            INTEGER PRIMARY KEY AUTOINCREMENT,
            name                          TEXT    NOT NULL,
            description                   TEXT    DEFAULT '',
            skills_md                     TEXT    DEFAULT '',
            tools_py                      TEXT    DEFAULT '',
            llm_model                     TEXT    DEFAULT '',
            llm_source                    TEXT    DEFAULT 'ollama',
            autonomy_max_retries          INTEGER DEFAULT 3,
            autonomy_confidence_threshold REAL    DEFAULT 0.7,
            autonomy_max_steps            INTEGER DEFAULT 10,
            created_at                    TEXT,
            updated_at                    TEXT
        );

        CREATE TABLE IF NOT EXISTS workflows (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            description TEXT    DEFAULT '',
            definition  TEXT    DEFAULT '{}',
            status      TEXT    DEFAULT 'draft',
            created_at  TEXT,
            updated_at  TEXT
        );

        CREATE TABLE IF NOT EXISTS executions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_id  INTEGER REFERENCES workflows(id),
            trace_id     TEXT    UNIQUE,
            input        TEXT,
            output       TEXT,
            status       TEXT    DEFAULT 'running',
            started_at   TEXT,
            finished_at  TEXT,
            total_tokens INTEGER DEFAULT 0,
            total_cost   REAL    DEFAULT 0.0
        );

        CREATE TABLE IF NOT EXISTS chat_sessions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_id   INTEGER REFERENCES workflows(id),
            agent_id      INTEGER REFERENCES agents(id),
            name          TEXT,
            created_at    TEXT,
            last_activity TEXT
        );

        CREATE TABLE IF NOT EXISTS messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER REFERENCES chat_sessions(id),
            role       TEXT,
            content    TEXT,
            trace_id   TEXT    DEFAULT '',
            timestamp  TEXT
        );

        CREATE TABLE IF NOT EXISTS traces (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            trace_id     TEXT    UNIQUE,
            execution_id INTEGER REFERENCES executions(id),
            data         TEXT    DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS logs (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            trace_id  TEXT    DEFAULT '',
            level     TEXT    DEFAULT 'INFO',
            message   TEXT,
            metadata  TEXT    DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            action        TEXT,
            resource_type TEXT,
            resource_id   TEXT,
            changes       TEXT  DEFAULT '{}',
            timestamp     TEXT
        );

        CREATE TABLE IF NOT EXISTS model_sources (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT,
            type       TEXT,
            base_url   TEXT,
            is_active  INTEGER DEFAULT 1,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS skills (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            description TEXT    DEFAULT '',
            skills_md   TEXT    DEFAULT '',
            tools_py    TEXT    DEFAULT '',
            tools_json  TEXT    DEFAULT '[]',
            category    TEXT    DEFAULT 'general',
            created_at  TEXT,
            updated_at  TEXT
        );
    """)

    # ── Migrations (idempotent) ───────────────────────────────────────────────
    if "agent_id" not in _col_names(conn, "chat_sessions"):
        c.execute("ALTER TABLE chat_sessions ADD COLUMN agent_id INTEGER")

    # Skills table migration
    existing = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    if "skills" not in existing:
        c.executescript("""
            CREATE TABLE IF NOT EXISTS skills (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                description TEXT    DEFAULT '',
                skills_md   TEXT    DEFAULT '',
                tools_py    TEXT    DEFAULT '',
                tools_json  TEXT    DEFAULT '[]',
                category    TEXT    DEFAULT 'general',
                created_at  TEXT,
                updated_at  TEXT
            );
        """)

    # ── Default settings ──────────────────────────────────────────────────────
    defaults = {
        "default_model":      "",
        "platform_name":      "Agentic Platform",
        "max_tool_calls":     "20",
        "max_exec_time":      "300",
        "max_cost":           "5.00",
        "log_retention_days": "30",
        "hitl":               "true",
        "sse":                "true",
        "cost_tracking":      "true",
        "trajectory":         "true",
    }
    for k, v in defaults.items():
        c.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO NOTHING",
            (k, v)
        )

    # ── Seed demo data (first run only) ──────────────────────────────────────
    if c.execute("SELECT COUNT(*) FROM agents").fetchone()[0] == 0:
        _seed(c)

    conn.commit()

    # ── Seed 10 library workflows (idempotent — skips existing names) ─────────
    try:
        from engine.workflow_seeder import seed_library_workflows
        n = seed_library_workflows(conn)
        if n:
            print(f"✓  Seeded {n} library workflow(s)")
    except Exception as _e:
        print(f"⚠  Workflow seeding skipped: {_e}")
    conn.close()
    print(f"✓  Database ready  →  {DB_PATH}")


def _seed(c: sqlite3.Cursor) -> None:
    now = _now()

    demo_agents = [
        (
            "Research Agent",
            "Searches the web and synthesises information into structured reports.",
            (
                "# Research Agent\n\n"
                "## Role\nYou are an expert research assistant. Find, analyse, and "
                "synthesise information from multiple sources into clear, structured reports.\n\n"
                "## Capabilities\n- Web search and information retrieval\n"
                "- Source evaluation and fact-checking\n"
                "- Report generation with citations\n\n"
                "## Behavioral Guidelines\n"
                "- Always verify facts from multiple sources\n"
                "- Cite your sources clearly\n"
                "- Structure output as: Summary, Key Findings, Sources"
            ),
            (
                'def web_search(query: str) -> str:\n'
                '    """Search the web for information."""\n'
                '    return f"Search results for: {query}"\n\n'
                'def fetch_url(url: str) -> str:\n'
                '    """Fetch content from a URL."""\n'
                '    return f"Content from: {url}"'
            ),
            "", "ollama",
        ),
        (
            "Writer Agent",
            "Transforms research and raw data into polished, publication-ready content.",
            (
                "# Writer Agent\n\n"
                "## Role\nYou are a professional writer who transforms research and "
                "data into compelling, clear prose.\n\n"
                "## Capabilities\n- Content structuring and outlining\n"
                "- Technical and narrative writing\n- Editing and proofreading\n\n"
                "## Behavioral Guidelines\n- Match tone to audience\n"
                "- Use active voice\n- Ensure logical flow between sections"
            ),
            (
                'def format_document(content: str, style: str = "markdown") -> str:\n'
                '    """Format content into a structured document."""\n'
                '    return f"Formatted as {style}: {content}"\n\n'
                'def check_grammar(text: str) -> dict:\n'
                '    """Check grammar and style."""\n'
                "    return {'issues': [], 'suggestions': []}"
            ),
            "", "ollama",
        ),
        (
            "Code Reviewer",
            "Analyses code for bugs, security issues, and best-practice violations.",
            (
                "# Code Reviewer\n\n"
                "## Role\nYou are a senior software engineer specialising in code "
                "review and quality assurance.\n\n"
                "## Capabilities\n- Static code analysis\n"
                "- Security vulnerability detection\n"
                "- Performance optimisation suggestions\n\n"
                "## Behavioral Guidelines\n- Be constructive and specific\n"
                "- Provide actionable feedback\n"
                "- Reference standards and best practices"
            ),
            (
                'def run_linter(code: str, language: str = "python") -> dict:\n'
                '    """Run linting on code."""\n'
                "    return {'errors': [], 'warnings': [], 'score': 95}\n\n"
                'def check_security(code: str) -> list:\n'
                '    """Check for security vulnerabilities."""\n'
                "    return []"
            ),
            "", "ollama",
        ),
    ]

    agent_ids = []
    for a in demo_agents:
        cur = c.execute(
            """INSERT INTO agents
               (name, description, skills_md, tools_py, llm_model, llm_source,
                created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (a[0], a[1], a[2], a[3], a[4], a[5], now, now)
        )
        agent_ids.append(cur.lastrowid)

    wf_def = json.dumps({
        "nodes": [
            {"id": "n1", "agent_id": agent_ids[0], "label": "Research Agent",
             "x": 80,  "y": 180, "type": "agent",  "model": ""},
            {"id": "n2", "agent_id": agent_ids[1], "label": "Writer Agent",
             "x": 340, "y": 180, "type": "agent",  "model": ""},
        ],
        "edges": [{"id": "e1", "source": "n1", "target": "n2"}],
    })
    c.execute(
        """INSERT INTO workflows (name, description, definition, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        ("Research & Report",
         "Automatically researches a topic and writes a structured report.",
         wf_def, "active", now, now)
    )

    c.execute(
        """INSERT INTO model_sources (name, type, base_url, is_active, created_at)
           VALUES (?, ?, ?, ?, ?)""",
        ("Ollama Local", "ollama", "http://localhost:11434", 1, now)
    )

    seed_logs = [
        ("INFO",    "System initialised successfully"),
        ("INFO",    "Workflow 'Research & Report' loaded"),
        ("INFO",    "Agent 'Research Agent' registered"),
        ("DEBUG",   "Polling Ollama: http://localhost:11434"),
        ("WARNING", "LLM response latency high: 4.2 s"),
        ("ERROR",   "Tool execution failed: web_search timeout"),
        ("INFO",    "Chat session started"),
        ("DEBUG",   "Trace data flushed to SQLite"),
    ]
    for level, msg in seed_logs:
        c.execute(
            "INSERT INTO logs (timestamp, level, message, metadata) VALUES (?, ?, ?, ?)",
            (now, level, msg, "{}")
        )


# ── Eagerly initialise on import ──────────────────────────────────────────────
# This runs before any request handler is registered, so the first HTTP request
# always finds a ready database even if the lifespan hook is delayed.
init_db()


# ── Lifespan (standard FastAPI startup hook) ──────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()   # idempotent — safe to call again
    yield


# ── App factory ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Agentic Workflow Orchestrator API",
    version="2.0",
    description="Visual multi-agent workflow builder and orchestration platform.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Legacy startup event (extra safety net) ───────────────────────────────────
@app.on_event("startup")
async def on_startup():
    init_db()


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(agents.router,    prefix="/api/v1")
app.include_router(workflows.router, prefix="/api/v1")
app.include_router(models.router,    prefix="/api/v1")
app.include_router(chat.router,      prefix="/api/v1")
app.include_router(logs.router,      prefix="/api/v1")
app.include_router(skills.router,    prefix="/api/v1")


# ── Serve frontend (must be mounted last) ─────────────────────────────────────
frontend_path = REPO_ROOT / "frontend"
if frontend_path.exists():
    app.mount(
        "/",
        StaticFiles(directory=str(frontend_path), html=True),
        name="frontend",
    )
