"""
Chat router — session management + streaming message dispatch.

Routing priority per message:
  1. msg.model_override  (user picked a model in the chat UI toolbar)
  2. agent.llm_model     (single-agent session)
  3. workflow first-node / supervisor agent model
  4. settings.default_model  (global fallback)
  5. first active source's first model  (last resort)
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import asyncio, json, uuid
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from db import get_conn

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

router = APIRouter(tags=["Chat"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    name: Optional[str] = None
    workflow_id: Optional[int] = None
    agent_id: Optional[int] = None


class MessageCreate(BaseModel):
    content: str
    workflow_id: Optional[int] = None
    agent_id: Optional[int] = None
    model_override: Optional[str] = None   # per-message model override from chat UI


# ── LLM resolution ────────────────────────────────────────────────────────────

def _resolve_llm(
    agent: Optional[dict],
    model_override: Optional[str],
    conn
) -> tuple:
    """
    Returns (model: str, base_url: str, source_type: str, source_name: str).

    Priority:
      1. model_override (from chat UI toolbar)
      2. agent.llm_model
      3. settings.default_model
      4. first model from first active source
    """
    chosen_model = model_override or (agent["llm_model"] if agent else None)
    agent_source_name = agent["llm_source"] if agent else None

    # If a model_override was specified, find which source serves it
    if model_override:
        # Try to find a source that has this model name in its name-match
        # We match by looking for the source whose base_url we'll use.
        # Use agent source first, then any active source.
        src_row = None
        if agent_source_name:
            src_row = conn.execute(
                "SELECT * FROM model_sources WHERE name=? AND is_active=1",
                (agent_source_name,)
            ).fetchone()
        if not src_row:
            src_row = conn.execute(
                "SELECT * FROM model_sources WHERE is_active=1 LIMIT 1"
            ).fetchone()
        if src_row:
            return (model_override, src_row["base_url"], src_row["type"], src_row["name"])
        return (model_override, "", "ollama", "unknown")

    # No override — use agent's configured source
    if agent_source_name:
        src_row = conn.execute(
            "SELECT * FROM model_sources WHERE name=? AND is_active=1",
            (agent_source_name,)
        ).fetchone()
        if not src_row:
            # Source name may be a type ("ollama") — try matching by type
            src_row = conn.execute(
                "SELECT * FROM model_sources WHERE type=? AND is_active=1",
                (agent_source_name,)
            ).fetchone()
        if not src_row:
            src_row = conn.execute(
                "SELECT * FROM model_sources WHERE is_active=1 LIMIT 1"
            ).fetchone()
    else:
        src_row = conn.execute(
            "SELECT * FROM model_sources WHERE is_active=1 LIMIT 1"
        ).fetchone()

    base_url = src_row["base_url"] if src_row else ""
    source_type = src_row["type"] if src_row else "ollama"
    source_name = src_row["name"] if src_row else "unknown"

    # Resolve model name
    if not chosen_model:
        setting = conn.execute(
            "SELECT value FROM settings WHERE key='default_model'"
        ).fetchone()
        chosen_model = setting["value"] if setting else None

    if not chosen_model and src_row:
        # Last resort: leave it to the LLM server's default
        chosen_model = "llama3.2"

    return (chosen_model or "llama3.2", base_url, source_type, source_name)


# ── LLM streaming ─────────────────────────────────────────────────────────────

async def _call_llm_stream(
    model: str, base_url: str, source_type: str, messages: list
):
    """
    Async generator yielding text tokens.
    Supports Ollama (/api/chat) and OpenAI-compat (/v1/chat/completions).
    Falls back gracefully to simulation if unreachable.
    """
    if not HAS_HTTPX or not base_url:
        async for t in _simulate_stream(messages[-1]["content"]):
            yield t
        return

    if source_type == "ollama":
        url = f"{base_url.rstrip('/')}/api/chat"
        payload = {"model": model, "messages": messages, "stream": True}
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", url, json=payload) as resp:
                    resp.raise_for_status()
                    async for raw in resp.aiter_lines():
                        if not raw.strip():
                            continue
                        try:
                            chunk = json.loads(raw)
                            token = chunk.get("message", {}).get("content", "")
                            if token:
                                yield token
                            if chunk.get("done"):
                                return
                        except Exception:
                            continue
        except Exception as exc:
            yield f"\n\n⚠️  Ollama unreachable at `{base_url}`: {exc}\n"
            yield "Start Ollama with `ollama serve` and ensure the model is pulled."

    else:
        # OpenAI-compatible (LM Studio, any openai_compat source)
        url = f"{base_url.rstrip('/')}/v1/chat/completions"
        payload = {"model": model, "messages": messages, "stream": True}
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", url, json=payload) as resp:
                    resp.raise_for_status()
                    async for raw in resp.aiter_lines():
                        if not raw.startswith("data: "):
                            continue
                        data = raw[6:].strip()
                        if data == "[DONE]":
                            return
                        try:
                            chunk = json.loads(data)
                            token = chunk["choices"][0]["delta"].get("content", "")
                            if token:
                                yield token
                        except Exception:
                            continue
        except Exception as exc:
            yield f"\n\n⚠️  LM Studio unreachable at `{base_url}`: {exc}\n"
            yield "Start LM Studio's local server and ensure a model is loaded."


async def _simulate_stream(user_msg: str):
    """Simulated token-by-token response when no LLM is reachable."""
    reply = (
        f'I received: "{user_msg[:100]}"\n\n'
        "**No live LLM endpoint is connected.** To get real AI responses:\n\n"
        "1. Install [Ollama](https://ollama.ai) and run `ollama serve`\n"
        "2. Pull a model: `ollama pull llama3.2`\n"
        "3. Go to **Models → Add Source** and add `http://localhost:11434` as type `ollama`\n"
        "4. Assign the model to this agent and retry.\n\n"
        "Alternatively, connect [LM Studio](https://lmstudio.ai) on port 1234."
    )
    for word in reply.split(" "):
        yield word + " "
        await asyncio.sleep(0.03)


# ── Prompt building ───────────────────────────────────────────────────────────

def _system_prompt(agent: Optional[dict], workflow: Optional[dict]) -> str:
    """Build the system prompt from agent skills.md or workflow description."""
    if agent and agent.get("skills_md", "").strip():
        return agent["skills_md"]
    if workflow:
        nodes_desc = ""
        try:
            wdef = json.loads(workflow.get("definition", "{}"))
            node_count = len(wdef.get("nodes", []))
            nodes_desc = f" It coordinates {node_count} agent node(s)."
        except Exception:
            pass
        return (
            f"You are the orchestrator for the workflow '{workflow['name']}'. "
            f"{workflow.get('description', '')}{nodes_desc} "
            "Your job is to understand the user's request, coordinate the appropriate "
            "agents, and synthesise their results into a single coherent response."
        )
    return "You are a helpful AI assistant. Answer clearly and concisely."


def _build_history(messages: list) -> list:
    """Convert DB messages to OpenAI-format chat history (last 14 turns)."""
    result = []
    for m in messages[-14:]:
        role = "user" if m["role"] == "user" else "assistant"
        content = m.get("content", "")
        if content:
            result.append({"role": role, "content": content})
    return result


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/chat/sessions", status_code=201)
def create_session(body: SessionCreate):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    name = body.name or f"Session {now[:10]}"
    cur = conn.execute(
        """INSERT INTO chat_sessions
           (workflow_id, agent_id, name, created_at, last_activity)
           VALUES (?,?,?,?,?)""",
        (body.workflow_id, body.agent_id, name, now, now)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM chat_sessions WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


@router.get("/chat/sessions")
def list_sessions():
    conn = get_conn()
    rows = conn.execute("""
        SELECT cs.*,
               w.name  AS workflow_name,
               a.name  AS agent_name,
               a.llm_model AS agent_model
        FROM   chat_sessions cs
        LEFT JOIN workflows w ON cs.workflow_id = w.id
        LEFT JOIN agents    a ON cs.agent_id    = a.id
        ORDER  BY cs.last_activity DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/chat/sessions/{session_id}")
def get_session(session_id: int):
    conn = get_conn()
    row = conn.execute("""
        SELECT cs.*,
               w.name  AS workflow_name,
               a.name  AS agent_name,
               a.llm_model AS agent_model
        FROM   chat_sessions cs
        LEFT JOIN workflows w ON cs.workflow_id = w.id
        LEFT JOIN agents    a ON cs.agent_id    = a.id
        WHERE  cs.id = ?
    """, (session_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Session not found")
    return dict(row)


@router.get("/chat/sessions/{session_id}/messages")
def get_messages(session_id: int):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM messages WHERE session_id=? ORDER BY timestamp ASC",
        (session_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/chat/sessions/{session_id}/message")
async def send_message(session_id: int, msg: MessageCreate):
    conn = get_conn()
    session = conn.execute(
        "SELECT * FROM chat_sessions WHERE id=?", (session_id,)
    ).fetchone()
    if not session:
        conn.close()
        raise HTTPException(404, "Session not found")
    session = dict(session)

    now = datetime.utcnow().isoformat()
    conn.execute(
        "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?,?,?,?)",
        (session_id, "user", msg.content, now)
    )
    conn.execute(
        "UPDATE chat_sessions SET last_activity=? WHERE id=?", (now, session_id)
    )
    conn.commit()

    # ── Resolve routing ────────────────────────────────────────────────────
    # Priority: explicit msg.agent_id > session.agent_id > workflow orchestrator
    agent_id    = msg.agent_id    or session.get("agent_id")
    workflow_id = msg.workflow_id or session.get("workflow_id")

    agent    = None
    workflow = None

    if agent_id:
        row = conn.execute("SELECT * FROM agents WHERE id=?", (agent_id,)).fetchone()
        if row:
            agent = dict(row)

    if not agent and workflow_id:
        row = conn.execute("SELECT * FROM workflows WHERE id=?", (workflow_id,)).fetchone()
        if row:
            workflow = dict(row)
            # Find the orchestrator agent: prefer supervisor nodes, then first node
            try:
                wdef  = json.loads(workflow.get("definition", "{}"))
                nodes = wdef.get("nodes", [])
                orchestrator_node = next(
                    (n for n in nodes if n.get("type") == "supervisor"), None
                ) or (nodes[0] if nodes else None)
                if orchestrator_node and orchestrator_node.get("agent_id"):
                    row2 = conn.execute(
                        "SELECT * FROM agents WHERE id=?",
                        (orchestrator_node["agent_id"],)
                    ).fetchone()
                    if row2:
                        agent = dict(row2)
            except Exception:
                pass

    # ── Resolve model + source ─────────────────────────────────────────────
    model, base_url, source_type, source_name = _resolve_llm(
        agent, msg.model_override, conn
    )

    # ── Build LLM messages ─────────────────────────────────────────────────
    system_prompt  = _system_prompt(agent, workflow)
    prior_msgs     = conn.execute(
        "SELECT * FROM messages WHERE session_id=? ORDER BY timestamp ASC",
        (session_id,)
    ).fetchall()
    history        = _build_history([dict(r) for r in prior_msgs])
    llm_messages   = [{"role": "system", "content": system_prompt}] + history

    conn.close()

    # ── Responder label ────────────────────────────────────────────────────
    if agent and workflow:
        responder = f"{workflow['name']} → {agent['name']}"
    elif agent:
        responder = agent["name"]
    elif workflow:
        responder = workflow["name"] + " (orchestrator)"
    else:
        responder = "Assistant"

    # Log the dispatch
    log_conn = get_conn()
    log_conn.execute(
        "INSERT INTO logs (timestamp, level, message, metadata) VALUES (?,?,?,?)",
        (now, "INFO",
         f"Chat dispatch: session={session_id} responder='{responder}' model={model}",
         json.dumps({"session_id": session_id, "model": model, "source": source_name}))
    )
    log_conn.commit()
    log_conn.close()

    full_response: list[str] = []

    async def sse_stream():
        # ── 1. Meta event ──────────────────────────────────────────────────
        yield f"data: {json.dumps({'type':'meta','responder':responder,'model':model,'source':source_name,'source_type':source_type})}\n\n"

        # ── 2. Token stream ────────────────────────────────────────────────
        async for token in _call_llm_stream(model, base_url, source_type, llm_messages):
            full_response.append(token)
            yield f"data: {json.dumps({'type':'token','content':token})}\n\n"
            await asyncio.sleep(0)      # yield control to event loop

        # ── 3. Persist assistant message ───────────────────────────────────
        complete = "".join(full_response)
        ts = datetime.utcnow().isoformat()
        db2 = get_conn()
        db2.execute(
            "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?,?,?,?)",
            (session_id, "assistant", complete, ts)
        )
        db2.execute(
            "UPDATE chat_sessions SET last_activity=? WHERE id=?", (ts, session_id)
        )
        db2.commit()
        db2.close()

        # ── 4. Done event ──────────────────────────────────────────────────
        yield f"data: {json.dumps({'type':'done','responder':responder,'tokens':len(complete.split())})}\n\n"

    return StreamingResponse(
        sse_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@router.delete("/chat/sessions/{session_id}")
def delete_session(session_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM messages WHERE session_id=?", (session_id,))
    conn.execute("DELETE FROM chat_sessions WHERE id=?", (session_id,))
    conn.commit()
    conn.close()
    return {"deleted": session_id}
