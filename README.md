# TantraFlow an Agentic Workflow Builder & Orchestrator

**Version 2.0** · FastAPI + SQLite + Vanilla JS

A web-based administrative dashboard for visually designing, configuring, and managing sophisticated multi-agent systems. No frameworks — pure HTML/CSS/JS frontend with a Python FastAPI backend.

---

## ⚠️ Python Version Requirement

**Python 3.10, 3.11, 3.12, or 3.13 is required.**  
Python 3.14+ is **not yet supported** — `pydantic-core` uses PyO3 (Rust bindings) which only has wheels for Python ≤ 3.13.

```bash
# Check your Python version
python3 --version

# If you have Python 3.14+, install 3.13 alongside it:

# macOS (Homebrew)
brew install python@3.13
/opt/homebrew/bin/python3.13 -m venv .venv

# pyenv (any platform)
pyenv install 3.13.3
pyenv local 3.13.3     # writes .python-version

# Windows — download the 3.13 installer from:
# https://www.python.org/downloads/release/python-3133/
```

> The start scripts (`start.sh` / `start.bat`) check your Python version automatically and will print a clear error with instructions if 3.14+ is detected.

---

## Features

- **Visual Workflow Builder** — drag-and-drop canvas to compose agent pipelines (serial, parallel, hierarchical)
- **Agent Management** — create/edit agents from `skills.md` + `tools.py` templates
- **Skills & Tools Browser** — inspect available capabilities before attaching to agents
- **Chat Interface** — interact with workflows in real time, with streaming SSE responses
- **Live Logs & Trace Viewer** — real-time log stream with per-execution span trees
- **Model Sources** — plug in Ollama, LM Studio, or any OpenAI-compatible endpoint
- **Governance** — bounded autonomy, HITL escalation, audit logging, cost tracking
- **Dashboard** — Chart.js powered metrics: executions, token usage, error rate, cost

---

## Architecture

```
agentic-platform/
├── frontend/               # Pure HTML/CSS/JS — no framework
│   ├── index.html          # App shell with sidebar + page containers
│   ├── css/
│   │   └── main.css        # Full design system (IBM Plex, light theme)
│   └── js/
│       ├── api.js          # REST + SSE client
│       ├── utils.js        # Toast, modal, helpers
│       ├── app.js          # Navigation & init
│       └── pages/
│           ├── dashboard.js
│           ├── workflows.js
│           ├── builder.js  # Canvas drag-and-drop
│           ├── agents.js
│           ├── skills.js
│           ├── models.js
│           ├── chat.js     # Streaming chat
│           ├── logs.js
│           └── settings.js
├── backend/
│   ├── main.py             # FastAPI app, DB init, CORS, static mount
│   ├── db.py               # SQLite connection helper
│   └── routers/
│       ├── agents.py       # CRUD + test endpoint
│       ├── workflows.py    # CRUD + execute + dashboard stats
│       ├── models.py       # LLM source management
│       ├── chat.py         # Session + streaming SSE messages
│       └── logs.py         # Log stream + trace viewer
├── data/                   # Created at runtime
│   ├── platform.db         # SQLite database (auto-seeded)
│   ├── uploads/
│   ├── skills/
│   └── tools/
├── requirements.txt
├── start.sh                # Linux/macOS launcher
├── start.bat               # Windows launcher
└── README.md
```

---

## Quick Start

### Prerequisites
- **Python 3.10+**
- (Optional) [Ollama](https://ollama.ai) or [LM Studio](https://lmstudio.ai) for live LLM responses

### Linux / macOS

```bash
git clone <repo-url>
cd agentic-platform
chmod +x start.sh
./start.sh
```

### Windows

```cmd
start.bat
```

### Manual

```bash
cd agentic-platform
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
mkdir -p data/uploads data/skills data/tools
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Then open **http://localhost:8000**

API docs at **http://localhost:8000/docs**

---

## Connecting a Real LLM

### Ollama
```bash
# Install Ollama (https://ollama.ai)
ollama pull llama3.2
ollama serve
```
Then in the platform: **Models → Add Source** → type `ollama` → URL `http://localhost:11434`

### LM Studio
1. Start LM Studio and load a model
2. Enable the local server (default port 1234)
3. **Models → Add Source** → type `lmstudio` → URL `http://localhost:1234`

---

## API Reference

All endpoints are available at `/api/v1`. Interactive docs at `/docs`.

| Resource | Endpoints |
|----------|-----------|
| Agents | `GET/POST /agents`, `GET/PUT/DELETE /agents/{id}`, `POST /agents/{id}/test` |
| Workflows | `GET/POST /workflows`, `GET/PUT/DELETE /workflows/{id}`, `POST /workflows/{id}/execute` |
| Executions | `GET /workflows/{id}/executions`, `GET /executions/{id}` |
| Models | `GET/POST /models/sources`, `GET /models/sources/{id}/models`, `GET /models` |
| Chat | `GET/POST /chat/sessions`, `POST /chat/sessions/{id}/message` (SSE) |
| Logs | `GET /logs`, `GET /traces/{id}`, `GET /audit-logs` |
| Dashboard | `GET /dashboards/stats` |

---

## Data Models

### Agent
Defined by two files:
- `skills.md` — Markdown role description, capabilities, behavioral guidelines
- `tools.py` — Python functions the agent can call at runtime

### Workflow
A directed graph `{ nodes: [...], edges: [...] }` serialized as JSON in SQLite.
- **Nodes**: agent instances with position, model override, and autonomy settings
- **Edges**: data-flow connections between nodes

### Execution Trace
Tree of spans stored as JSON: each span has `name`, `status`, `latency_ms`, `tokens`, `output`.

---

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| 1 | Done | Core MVP, agent templates, Ollama integration, logging |
| 2 | Done | Visual canvas builder, workflow save/load |
| 3 | In Progress | Real LLM streaming, document upload, supervisor decomposition |
| 4 | Planned | HITL controls, trajectory monitoring, cost dashboard |
| 5 | Planned | MCP/A2A integration, user roles, test harness |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS · Chart.js · SortableJS · Font Awesome |
| Backend | Python 3.10+ · FastAPI · Pydantic v2 · Uvicorn |
| Database | SQLite (relational + JSON columns) |
| LLM | Ollama · LM Studio · OpenAI-compatible endpoints |
| Realtime | Server-Sent Events (SSE) for log streaming and chat |

---

## License

MIT
