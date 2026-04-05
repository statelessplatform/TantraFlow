"""
Workflows router
================
CRUD + async execution + output file serving + import/export.

Route order matters for FastAPI:
  /workflows/library  must come BEFORE  /workflows/{workflow_id}
  /workflows/import   must come BEFORE  /workflows/{workflow_id}
"""
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from db import get_conn, OUTPUT_DIR

router = APIRouter(tags=["Workflows"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Pydantic ──────────────────────────────────────────────────────────────────

class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    definition: Optional[dict] = {}


class WorkflowUpdate(WorkflowCreate):
    status: Optional[str] = "draft"


class ExecuteRequest(BaseModel):
    input: Optional[str] = ""
    output_type: Optional[str] = "text"


# ── Library (MUST be before /{workflow_id}) ───────────────────────────────────

@router.get("/workflows/library")
def list_library_workflows():
    """
    Return metadata for the 10 built-in workflow templates.
    These are read directly from workflow_library.py — no DB call needed.
    The library is automatically seeded into the DB on server startup.
    """
    try:
        from engine.workflow_library import WORKFLOWS
        return [
            {
                "name":        w["name"],
                "description": w["description"],
                "category":    w.get("category", "general"),
                "tags":        w.get("tags", []),
                "version":     w.get("version", "1.0"),
                "node_count":  len(w.get("nodes", [])),
                "output_types": sorted(set(
                    n.get("output_type", "txt") for n in w.get("nodes", [])
                )),
                "agents":      w.get("agents", []),
                "docs":        w.get("docs", "").strip(),
            }
            for w in WORKFLOWS
        ]
    except Exception as exc:
        raise HTTPException(500, f"Library unavailable: {exc}")


# ── Import (MUST be before /{workflow_id}) ────────────────────────────────────

@router.post("/workflows/import")
async def import_workflow(request: Request):
    """
    Import a workflow bundle produced by GET /workflows/{id}/export.

    Body: the raw JSON bundle (Content-Type: application/json).

    Steps:
    1. Validate bundle format ("agentic-platform-workflow")
    2. Upsert all embedded agents by name (create if missing, update skills/tools if changed)
    3. Remap original agent IDs → new local IDs in node definitions
    4. Insert the workflow (appends " (imported)" if name already exists)

    Returns: { workflow_id, workflow_name, agents_created, agents_updated }
    """
    try:
        bundle = await request.json()
    except Exception:
        raise HTTPException(400, "Request body must be valid JSON")

    conn = get_conn()
    try:
        from engine.workflow_seeder import import_bundle
        result = import_bundle(bundle, conn)
        # Log the import
        conn.execute(
            "INSERT INTO logs (timestamp, level, message, metadata) VALUES (?,?,?,?)",
            (_now(), "INFO",
             f"Workflow imported: '{result['workflow_name']}' "
             f"(agents created: {result['agents_created']}, updated: {result['agents_updated']})",
             json.dumps(result))
        )
        conn.commit()
    except ValueError as exc:
        conn.close()
        raise HTTPException(400, str(exc))
    except Exception as exc:
        conn.close()
        raise HTTPException(500, f"Import failed: {exc}")
    conn.close()
    return result


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/workflows")
def list_workflows():
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM workflows ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        try:
            d["definition"] = json.loads(d["definition"])
        except Exception:
            d["definition"] = {}
        result.append(d)
    return result


@router.post("/workflows", status_code=201)
def create_workflow(wf: WorkflowCreate):
    now = _now()
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO workflows (name, description, definition, status, created_at, updated_at)"
        " VALUES (?,?,?,?,?,?)",
        (wf.name, wf.description, json.dumps(wf.definition), "draft", now, now)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM workflows WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    d = dict(row)
    d["definition"] = json.loads(d["definition"])
    return d


@router.get("/workflows/{workflow_id}")
def get_workflow(workflow_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM workflows WHERE id=?", (workflow_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Workflow not found")
    d = dict(row)
    try:
        d["definition"] = json.loads(d["definition"])
    except Exception:
        d["definition"] = {}
    return d


@router.put("/workflows/{workflow_id}")
def update_workflow(workflow_id: int, wf: WorkflowUpdate):
    now = _now()
    conn = get_conn()
    conn.execute(
        "UPDATE workflows SET name=?, description=?, definition=?, status=?, updated_at=? WHERE id=?",
        (wf.name, wf.description, json.dumps(wf.definition), wf.status, now, workflow_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM workflows WHERE id=?", (workflow_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Workflow not found")
    d = dict(row)
    d["definition"] = json.loads(d["definition"])
    return d


@router.patch("/workflows/{workflow_id}/status")
def set_workflow_status(workflow_id: int, body: dict):
    """Promote draft → active, pause, archive."""
    status = body.get("status", "active")
    valid  = {"draft", "active", "paused", "archived"}
    if status not in valid:
        raise HTTPException(400, f"status must be one of {valid}")
    conn = get_conn()
    conn.execute(
        "UPDATE workflows SET status=?, updated_at=? WHERE id=?",
        (status, _now(), workflow_id)
    )
    conn.commit()
    row = conn.execute(
        "SELECT id, name, status, updated_at FROM workflows WHERE id=?", (workflow_id,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Workflow not found")
    return dict(row)


@router.delete("/workflows/{workflow_id}")
def delete_workflow(workflow_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM workflows WHERE id=?", (workflow_id,))
    conn.commit()
    conn.close()
    return {"deleted": workflow_id}


# ── Export (after CRUD, before /{id} catch-all) ───────────────────────────────

@router.get("/workflows/{workflow_id}/export")
def export_workflow(workflow_id: int):
    """
    Export a workflow as a self-contained JSON bundle.

    The bundle includes:
    - Complete workflow definition (nodes, edges, metadata, docs)
    - Full skills.md and tools.py for every agent referenced by nodes

    Share the downloaded .json file with other users.
    They import it via POST /api/v1/workflows/import.
    """
    conn = get_conn()
    try:
        from engine.workflow_seeder import bundle_workflow
        bundle = bundle_workflow(workflow_id, conn)
        # Log the export
        conn.execute(
            "INSERT INTO logs (timestamp, level, message, metadata) VALUES (?,?,?,?)",
            (_now(), "INFO",
             f"Workflow exported: '{bundle['workflow']['name']}' (id={workflow_id})",
             json.dumps({"workflow_id": workflow_id, "agents": len(bundle["agents"])}))
        )
        conn.commit()
    except ValueError as exc:
        conn.close()
        raise HTTPException(404, str(exc))
    except Exception as exc:
        conn.close()
        raise HTTPException(500, f"Export failed: {exc}")
    conn.close()

    wf_name_safe = bundle["workflow"]["name"].replace(" ", "_").replace("/", "-")
    return JSONResponse(
        content=bundle,
        headers={
            "Content-Disposition": f'attachment; filename="{wf_name_safe}_workflow.json"'
        }
    )


# ── Execution ─────────────────────────────────────────────────────────────────

@router.post("/workflows/{workflow_id}/execute")
async def execute_workflow(
    workflow_id: int,
    req: ExecuteRequest,
    background_tasks: BackgroundTasks,
):
    """
    Start a real workflow execution.

    Returns immediately with execution_id and trace_id.
    The LLM calls run in the background — poll GET /executions/{id} for status.
    Output files are written to data/outputs/<trace_id>/ as they are produced.

    Model selection: each agent uses the model set on its agent record.
    Change models any time via the Agents page inline switcher —
    changes take effect on the next execution (even mid-workflow for new runs).
    """
    conn = get_conn()
    wf = conn.execute("SELECT * FROM workflows WHERE id=?", (workflow_id,)).fetchone()
    if not wf:
        conn.close()
        raise HTTPException(404, "Workflow not found")

    # Validate: must have nodes
    try:
        definition = json.loads(wf["definition"] or "{}")
    except Exception:
        definition = {}
    nodes = definition.get("nodes", [])
    if not nodes:
        conn.close()
        raise HTTPException(400,
            "Workflow has no nodes. Open the Builder, drag agents onto the canvas, "
            "connect them with edges, then save.")

    trace_id = str(uuid.uuid4())
    now      = _now()

    cur = conn.execute(
        "INSERT INTO executions (workflow_id, trace_id, input, status, started_at, total_tokens, total_cost)"
        " VALUES (?,?,?,?,?,?,?)",
        (workflow_id, trace_id, req.input, "running", now, 0, 0.0)
    )
    execution_id = cur.lastrowid

    # Auto-promote draft → active on first execution
    conn.execute(
        "UPDATE workflows SET status='active' WHERE id=? AND status='draft'",
        (workflow_id,)
    )
    conn.execute(
        "INSERT INTO logs (timestamp, trace_id, level, message, metadata) VALUES (?,?,?,?,?)",
        (now, trace_id, "INFO",
         f"[EXEC START] Workflow '{wf['name']}' — {len(nodes)} nodes — trace={trace_id}",
         json.dumps({"workflow_id": workflow_id, "nodes": len(nodes),
                     "execution_id": execution_id}))
    )
    conn.commit()
    conn.close()

    from engine.executor import execute_workflow_async

    async def _run():
        try:
            await execute_workflow_async(workflow_id, req.input, execution_id, trace_id)
        except Exception as exc:
            db2 = get_conn()
            db2.execute(
                "UPDATE executions SET status=?, finished_at=?, output=? WHERE id=?",
                ("failed", _now(), str(exc), execution_id)
            )
            db2.execute(
                "INSERT INTO logs (timestamp, trace_id, level, message, metadata)"
                " VALUES (?,?,?,?,?)",
                (_now(), trace_id, "ERROR",
                 f"[EXEC FAILED] {exc}",
                 json.dumps({"execution_id": execution_id, "error": str(exc)}))
            )
            db2.commit()
            db2.close()

    background_tasks.add_task(_run)

    return {
        "trace_id":     trace_id,
        "execution_id": execution_id,
        "status":       "running",
        "nodes":        len(nodes),
        "message":      (
            f"Execution started ({len(nodes)} nodes). "
            f"Poll GET /api/v1/executions/{execution_id} for status. "
            f"Files → data/outputs/{trace_id}/"
        ),
    }


@router.get("/workflows/{workflow_id}/executions")
def list_executions(workflow_id: int):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM executions WHERE workflow_id=? ORDER BY started_at DESC",
        (workflow_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Execution detail ──────────────────────────────────────────────────────────

@router.get("/executions/{execution_id}")
def get_execution(execution_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM executions WHERE id=?", (execution_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Execution not found")
    trace = conn.execute(
        "SELECT data FROM traces WHERE execution_id=?", (execution_id,)
    ).fetchone()
    conn.close()
    d = dict(row)
    try:
        d["trace"] = json.loads(trace["data"]) if trace else {}
    except Exception:
        d["trace"] = {}
    return d


# ── Output file serving ───────────────────────────────────────────────────────

@router.get("/outputs/{trace_id}/files")
def list_output_files(trace_id: str):
    """List all files produced by an execution, with download URLs."""
    run_dir = OUTPUT_DIR / trace_id
    if not run_dir.exists():
        return {"trace_id": trace_id, "files": [], "output_dir": str(run_dir)}
    files = []
    for f in sorted(run_dir.iterdir()):
        if f.is_file():
            files.append({
                "name": f.name,
                "size": f.stat().st_size,
                "ext":  f.suffix.lstrip("."),
                "url":  f"/api/v1/outputs/{trace_id}/download/{f.name}",
            })
    return {"trace_id": trace_id, "files": files, "output_dir": str(run_dir)}


@router.get("/outputs/{trace_id}/download/{filename}")
def download_output_file(trace_id: str, filename: str):
    """Download a specific output file — no path traversal allowed."""
    safe_name = Path(filename).name
    file_path = OUTPUT_DIR / trace_id / safe_name
    if not file_path.exists():
        raise HTTPException(404, f"File not found: {safe_name}")
    return FileResponse(
        path=str(file_path),
        filename=safe_name,
        media_type="application/octet-stream",
    )


# ── Dashboard stats ───────────────────────────────────────────────────────────

@router.get("/dashboards/stats")
def dashboard_stats():
    conn = get_conn()
    agents_count    = conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0]
    workflows_count = conn.execute("SELECT COUNT(*) FROM workflows").fetchone()[0]
    execs_count     = conn.execute("SELECT COUNT(*) FROM executions").fetchone()[0]
    running         = conn.execute("SELECT COUNT(*) FROM executions WHERE status='running'").fetchone()[0]
    errors          = conn.execute("SELECT COUNT(*) FROM executions WHERE status='failed'").fetchone()[0]
    tokens          = conn.execute("SELECT COALESCE(SUM(total_tokens),0) FROM executions").fetchone()[0]
    cost            = conn.execute("SELECT COALESCE(SUM(total_cost),0.0) FROM executions").fetchone()[0]
    recent_execs    = conn.execute("""
        SELECT e.id, e.status, e.started_at, e.finished_at,
               e.total_tokens, e.total_cost, w.name AS workflow_name
        FROM   executions e
        LEFT JOIN workflows w ON e.workflow_id = w.id
        ORDER  BY e.started_at DESC LIMIT 5
    """).fetchall()
    conn.close()
    return {
        "agents":            agents_count,
        "workflows":         workflows_count,
        "executions":        execs_count,
        "running":           running,
        "errors":            errors,
        "total_tokens":      tokens,
        "total_cost":        round(cost, 6),
        "recent_executions": [dict(r) for r in recent_execs],
    }
