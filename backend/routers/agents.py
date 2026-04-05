from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from db import get_conn

router = APIRouter(tags=["Agents"])

class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    skills_md: Optional[str] = ""
    tools_py: Optional[str] = ""
    llm_model: Optional[str] = "llama3.2"
    llm_source: Optional[str] = "ollama"
    autonomy_max_retries: Optional[int] = 3
    autonomy_confidence_threshold: Optional[float] = 0.7
    autonomy_max_steps: Optional[int] = 10

class AgentUpdate(AgentCreate):
    pass

@router.get("/agents")
def list_agents():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM agents ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.post("/agents", status_code=201)
def create_agent(agent: AgentCreate):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    cur = conn.execute("""
        INSERT INTO agents (name, description, skills_md, tools_py, llm_model, llm_source,
            autonomy_max_retries, autonomy_confidence_threshold, autonomy_max_steps, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (agent.name, agent.description, agent.skills_md, agent.tools_py,
          agent.llm_model, agent.llm_source, agent.autonomy_max_retries,
          agent.autonomy_confidence_threshold, agent.autonomy_max_steps, now, now))
    conn.commit()
    row = conn.execute("SELECT * FROM agents WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)

@router.get("/agents/{agent_id}")
def get_agent(agent_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM agents WHERE id=?", (agent_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Agent not found")
    return dict(row)

@router.put("/agents/{agent_id}")
def update_agent(agent_id: int, agent: AgentUpdate):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    conn.execute("""
        UPDATE agents SET name=?, description=?, skills_md=?, tools_py=?, llm_model=?,
            llm_source=?, autonomy_max_retries=?, autonomy_confidence_threshold=?,
            autonomy_max_steps=?, updated_at=?
        WHERE id=?
    """, (agent.name, agent.description, agent.skills_md, agent.tools_py,
          agent.llm_model, agent.llm_source, agent.autonomy_max_retries,
          agent.autonomy_confidence_threshold, agent.autonomy_max_steps, now, agent_id))
    conn.commit()
    row = conn.execute("SELECT * FROM agents WHERE id=?", (agent_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Agent not found")
    return dict(row)

@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM agents WHERE id=?", (agent_id,))
    conn.commit()
    conn.close()
    return {"deleted": agent_id}

@router.post("/agents/{agent_id}/test")
def test_agent(agent_id: int, body: dict):
    conn = get_conn()
    row = conn.execute("SELECT * FROM agents WHERE id=?", (agent_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Agent not found")
    prompt = body.get("prompt", "Hello")
    return {
        "agent_id": agent_id,
        "agent_name": row["name"],
        "prompt": prompt,
        "response": f"[Simulated] Agent '{row['name']}' received: '{prompt}'. Connect a real LLM endpoint to get live responses.",
        "tokens": 42,
        "latency_ms": 320
    }

class AgentModelPatch(BaseModel):
    llm_model: str
    llm_source: Optional[str] = None

@router.patch("/agents/{agent_id}/model")
def patch_agent_model(agent_id: int, patch: AgentModelPatch):
    """Quick-switch just the model/source on an agent without a full PUT."""
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    if patch.llm_source:
        conn.execute(
            "UPDATE agents SET llm_model=?, llm_source=?, updated_at=? WHERE id=?",
            (patch.llm_model, patch.llm_source, now, agent_id)
        )
    else:
        conn.execute(
            "UPDATE agents SET llm_model=?, updated_at=? WHERE id=?",
            (patch.llm_model, now, agent_id)
        )
    conn.commit()
    row = conn.execute("SELECT * FROM agents WHERE id=?", (agent_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Agent not found")
    return dict(row)


# ── Skills repository (stored in agents table, type='skill') ──────────────────

class SkillCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    skills_md: Optional[str] = ""
    tools_py:  Optional[str] = ""
    category:  Optional[str] = "general"

@router.get("/skills")
def list_skills():
    """All saved skill templates (not yet tied to an agent)."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM skills ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.post("/skills", status_code=201)
def create_skill(skill: SkillCreate):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    # Parse tool function signatures from tools_py
    tools = []
    for line in (skill.tools_py or "").split("\n"):
        line = line.strip()
        if line.startswith("def ") and line.endswith(":"):
            sig = line[4:-1].strip()
            tools.append(sig)
    cur = conn.execute(
        """INSERT INTO skills (name, description, skills_md, tools_py, tools_json, category, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (skill.name, skill.description, skill.skills_md, skill.tools_py,
         json.dumps(tools), skill.category, now, now)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM skills WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    d = dict(row)
    try: d["tools_json"] = json.loads(d["tools_json"])
    except: d["tools_json"] = []
    return d

@router.put("/skills/{skill_id}")
def update_skill(skill_id: int, skill: SkillCreate):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    tools = []
    for line in (skill.tools_py or "").split("\n"):
        line = line.strip()
        if line.startswith("def ") and line.endswith(":"):
            sig = line[4:-1].strip()
            tools.append(sig)
    conn.execute(
        """UPDATE skills SET name=?, description=?, skills_md=?, tools_py=?,
           tools_json=?, category=?, updated_at=? WHERE id=?""",
        (skill.name, skill.description, skill.skills_md, skill.tools_py,
         json.dumps(tools), skill.category, now, skill_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM skills WHERE id=?", (skill_id,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Skill not found")
    d = dict(row)
    try: d["tools_json"] = json.loads(d["tools_json"])
    except: d["tools_json"] = []
    return d

@router.delete("/skills/{skill_id}")
def delete_skill(skill_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM skills WHERE id=?", (skill_id,))
    conn.commit()
    conn.close()
    return {"deleted": skill_id}

@router.post("/skills/{skill_id}/create-agent")
def create_agent_from_skill(skill_id: int, body: dict):
    """Instantiate a skill as a runnable agent."""
    conn = get_conn()
    skill = conn.execute("SELECT * FROM skills WHERE id=?", (skill_id,)).fetchone()
    if not skill: conn.close(); raise HTTPException(404, "Skill not found")
    now = datetime.utcnow().isoformat()
    name = body.get("name") or skill["name"]
    cur = conn.execute(
        """INSERT INTO agents (name, description, skills_md, tools_py, llm_model, llm_source,
           autonomy_max_retries, autonomy_confidence_threshold, autonomy_max_steps, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (name, skill["description"], skill["skills_md"], skill["tools_py"],
         "", "ollama", 3, 0.7, 10, now, now)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM agents WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)
