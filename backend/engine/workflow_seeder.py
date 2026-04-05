"""
workflow_seeder.py — seeds the 10 library workflows + agents into the DB.

Called from main.py on first run OR when workflows table is empty.
Also provides the bundle_workflow() function used by the export endpoint.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from engine.workflow_library import WORKFLOWS, _AGENTS


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def seed_library_workflows(conn: sqlite3.Connection) -> int:
    """
    Insert all 10 library workflows and their agents.
    Returns number of workflows inserted.
    Idempotent — skips workflows that already exist by name.
    """
    c = conn.cursor()
    inserted = 0

    # Build agent_key → DB id map, inserting missing agents
    agent_id_map: dict[str, int] = {}
    for key, (name, desc, skills_md, tools_py) in _AGENTS.items():
        row = c.execute("SELECT id FROM agents WHERE name=?", (name,)).fetchone()
        if row:
            agent_id_map[key] = row[0]
        else:
            now = _now()
            r = c.execute(
                """INSERT INTO agents
                   (name, description, skills_md, tools_py,
                    llm_model, llm_source,
                    autonomy_max_retries, autonomy_confidence_threshold,
                    autonomy_max_steps, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (name, desc, skills_md, tools_py, "", "ollama",
                 3, 0.7, 15, now, now)
            )
            agent_id_map[key] = r.lastrowid

    # Insert workflows
    for wf in WORKFLOWS:
        exists = c.execute(
            "SELECT id FROM workflows WHERE name=?", (wf["name"],)
        ).fetchone()
        if exists:
            continue  # skip — don't overwrite user customisations

        # Resolve agent_key → agent_id in node definitions
        definition = _build_definition(wf, agent_id_map)

        now = _now()
        c.execute(
            """INSERT INTO workflows
               (name, description, definition, status, created_at, updated_at)
               VALUES (?,?,?,?,?,?)""",
            (
                wf["name"],
                wf["description"],
                json.dumps(definition),
                "active",
                now,
                now,
            ),
        )
        inserted += 1

    conn.commit()
    return inserted


def _build_definition(wf: dict, agent_id_map: dict) -> dict:
    """Replace agent_key placeholders with real DB agent IDs."""
    nodes = []
    for n in wf.get("nodes", []):
        node = dict(n)
        key = node.pop("agent_key", None)
        if key and key in agent_id_map:
            node["agent_id"] = agent_id_map[key]
        # Embed the task instruction as a system_prompt_note on the node
        # (executor reads this if no skills.md system prompt is set)
        nodes.append(node)
    return {
        "nodes": nodes,
        "edges": wf.get("edges", []),
        "meta": {
            "category":    wf.get("category", "general"),
            "tags":        wf.get("tags", []),
            "version":     wf.get("version", "1.0"),
            "docs":        wf.get("docs", ""),
            "library":     True,   # marks this as a library workflow
        },
    }


# ── Export / Import bundle ────────────────────────────────────────────────────

def bundle_workflow(workflow_id: int, conn: sqlite3.Connection) -> dict:
    """
    Export a workflow as a self-contained JSON bundle.
    Includes the workflow definition PLUS the full skills_md + tools_py
    of every agent referenced by its nodes, so the bundle can be imported
    on any other instance of this platform.

    Bundle schema:
    {
      "format":   "agentic-platform-workflow",
      "version":  "1.0",
      "exported": "<ISO timestamp>",
      "workflow": { ...workflow row... },
      "agents":   [ { ...agent row... }, ... ]
    }
    """
    wf_row = conn.execute(
        "SELECT * FROM workflows WHERE id=?", (workflow_id,)
    ).fetchone()
    if not wf_row:
        raise ValueError(f"Workflow {workflow_id} not found")

    wf = dict(wf_row)
    try:
        definition = json.loads(wf.get("definition", "{}"))
    except Exception:
        definition = {}

    # Collect all agent IDs referenced in nodes
    agent_ids = set()
    for node in definition.get("nodes", []):
        if node.get("agent_id"):
            agent_ids.add(int(node["agent_id"]))

    agents = []
    for aid in agent_ids:
        row = conn.execute("SELECT * FROM agents WHERE id=?", (aid,)).fetchone()
        if row:
            agents.append(dict(row))

    return {
        "format":   "agentic-platform-workflow",
        "version":  "1.0",
        "exported": _now(),
        "workflow": {
            "name":        wf["name"],
            "description": wf["description"],
            "definition":  definition,
            "status":      wf["status"],
        },
        "agents": [
            {
                "name":                          a["name"],
                "description":                   a["description"],
                "skills_md":                     a["skills_md"],
                "tools_py":                      a["tools_py"],
                "llm_model":                     a["llm_model"],
                "llm_source":                    a["llm_source"],
                "autonomy_max_retries":          a["autonomy_max_retries"],
                "autonomy_confidence_threshold": a["autonomy_confidence_threshold"],
                "autonomy_max_steps":            a["autonomy_max_steps"],
                # Keep original DB id so we can remap during import
                "_original_id": a["id"],
            }
            for a in agents
        ],
    }


def import_bundle(bundle: dict, conn: sqlite3.Connection) -> dict:
    """
    Import a workflow bundle exported by bundle_workflow().
    - Upserts agents (matches by name; updates skills/tools if changed)
    - Remaps original agent IDs → new local IDs in the node definitions
    - Inserts the workflow (appends "(imported)" if name already exists)

    Returns {"workflow_id": int, "agents_created": int, "agents_updated": int}
    """
    if bundle.get("format") != "agentic-platform-workflow":
        raise ValueError("Invalid bundle format. Expected 'agentic-platform-workflow'.")

    c = conn.cursor()
    now = _now()
    id_remap: dict[int, int] = {}   # original_id → local_id
    agents_created = 0
    agents_updated = 0

    # ── 1. Upsert agents ──────────────────────────────────────────────────────
    for a in bundle.get("agents", []):
        orig_id = a.get("_original_id")
        existing = c.execute(
            "SELECT id FROM agents WHERE name=?", (a["name"],)
        ).fetchone()

        if existing:
            # Update skills/tools in case the bundle has a newer version
            c.execute(
                """UPDATE agents SET description=?, skills_md=?, tools_py=?,
                   llm_model=?, autonomy_max_retries=?,
                   autonomy_confidence_threshold=?, autonomy_max_steps=?,
                   updated_at=?
                   WHERE id=?""",
                (
                    a.get("description", ""),
                    a.get("skills_md", ""),
                    a.get("tools_py", ""),
                    a.get("llm_model", ""),
                    a.get("autonomy_max_retries", 3),
                    a.get("autonomy_confidence_threshold", 0.7),
                    a.get("autonomy_max_steps", 10),
                    now,
                    existing[0],
                ),
            )
            local_id = existing[0]
            agents_updated += 1
        else:
            r = c.execute(
                """INSERT INTO agents
                   (name, description, skills_md, tools_py,
                    llm_model, llm_source,
                    autonomy_max_retries, autonomy_confidence_threshold,
                    autonomy_max_steps, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    a["name"],
                    a.get("description", ""),
                    a.get("skills_md", ""),
                    a.get("tools_py", ""),
                    a.get("llm_model", ""),
                    a.get("llm_source", "ollama"),
                    a.get("autonomy_max_retries", 3),
                    a.get("autonomy_confidence_threshold", 0.7),
                    a.get("autonomy_max_steps", 10),
                    now, now,
                ),
            )
            local_id = r.lastrowid
            agents_created += 1

        if orig_id is not None:
            id_remap[orig_id] = local_id

    # ── 2. Remap agent IDs in node definitions ────────────────────────────────
    wf_data   = bundle.get("workflow", {})
    definition = wf_data.get("definition", {})
    nodes = definition.get("nodes", [])
    for node in nodes:
        orig = node.get("agent_id")
        if orig is not None and int(orig) in id_remap:
            node["agent_id"] = id_remap[int(orig)]

    # ── 3. Insert workflow ────────────────────────────────────────────────────
    wf_name = wf_data.get("name", "Imported Workflow")
    existing_wf = c.execute(
        "SELECT id FROM workflows WHERE name=?", (wf_name,)
    ).fetchone()
    if existing_wf:
        wf_name = wf_name + " (imported)"

    r = c.execute(
        """INSERT INTO workflows (name, description, definition, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?)""",
        (
            wf_name,
            wf_data.get("description", ""),
            json.dumps(definition),
            "active",
            now, now,
        ),
    )
    workflow_id = r.lastrowid

    conn.commit()
    return {
        "workflow_id":     workflow_id,
        "workflow_name":   wf_name,
        "agents_created":  agents_created,
        "agents_updated":  agents_updated,
    }
