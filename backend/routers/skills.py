"""
Skills router — persistent skills library backed by SQLite.

A "skill" = skills.md + tools.py pair that can be:
  - browsed in the Skills & Tools page
  - instantly converted into a new Agent
  - imported from agency-agents or any .md source
"""

import json
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from db import get_conn

router = APIRouter(tags=["Skills"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_tools(tools_py: str) -> list:
    """Pull function signatures from tools.py source."""
    sigs = []
    for line in (tools_py or "").split("\n"):
        m = re.match(r"\s*def\s+(\w+\s*\([^)]*\))", line)
        if m:
            sigs.append(m.group(1).strip())
    return sigs


def _row_to_dict(row) -> dict:
    d = dict(row)
    try:
        d["tool_signatures"] = json.loads(d.get("tool_signatures") or "[]")
    except Exception:
        d["tool_signatures"] = []
    return d


class SkillCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    category: Optional[str] = "General"
    tags: Optional[str] = ""
    skills_md: Optional[str] = ""
    tools_py: Optional[str] = ""


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/skills")
def list_skills():
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM skills ORDER BY category, name"
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


@router.post("/skills", status_code=201)
def create_skill(skill: SkillCreate):
    now = _now()
    sigs = _extract_tools(skill.tools_py)
    conn = get_conn()
    cur = conn.execute(
        """INSERT INTO skills
           (name, description, category, tags, skills_md, tools_py,
            tool_signatures, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (skill.name, skill.description, skill.category, skill.tags,
         skill.skills_md, skill.tools_py, json.dumps(sigs), now, now)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM skills WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return _row_to_dict(row)


@router.get("/skills/{skill_id}")
def get_skill(skill_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM skills WHERE id=?", (skill_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Skill not found")
    return _row_to_dict(row)


@router.put("/skills/{skill_id}")
def update_skill(skill_id: int, skill: SkillCreate):
    now = _now()
    sigs = _extract_tools(skill.tools_py)
    conn = get_conn()
    conn.execute(
        """UPDATE skills SET name=?,description=?,category=?,tags=?,
           skills_md=?,tools_py=?,tool_signatures=?,updated_at=?
           WHERE id=?""",
        (skill.name, skill.description, skill.category, skill.tags,
         skill.skills_md, skill.tools_py, json.dumps(sigs), now, skill_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM skills WHERE id=?", (skill_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Skill not found")
    return _row_to_dict(row)


@router.delete("/skills/{skill_id}")
def delete_skill(skill_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM skills WHERE id=?", (skill_id,))
    conn.commit()
    conn.close()
    return {"deleted": skill_id}


@router.post("/skills/{skill_id}/create-agent", status_code=201)
def skill_to_agent(skill_id: int, body: dict):
    """
    Instantly create an Agent pre-loaded with this skill's md + tools.
    Body: { "name": optional override, "llm_model": "", "llm_source": "ollama" }
    """
    conn = get_conn()
    skill = conn.execute("SELECT * FROM skills WHERE id=?", (skill_id,)).fetchone()
    if not skill:
        conn.close()
        raise HTTPException(404, "Skill not found")
    s = dict(skill)
    now = _now()
    name = body.get("name") or s["name"]
    cur = conn.execute(
        """INSERT INTO agents
           (name, description, skills_md, tools_py, llm_model, llm_source,
            autonomy_max_retries, autonomy_confidence_threshold,
            autonomy_max_steps, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (name, s["description"], s["skills_md"], s["tools_py"],
         body.get("llm_model", ""), body.get("llm_source", "ollama"),
         3, 0.7, 10, now, now)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM agents WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)
