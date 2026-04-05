from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime
import json, uuid
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from db import get_conn

router = APIRouter(tags=["Logs & Traces"])

@router.get("/logs")
def get_logs(
    level: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = 0
):
    conn = get_conn()
    if level:
        rows = conn.execute(
            "SELECT * FROM logs WHERE level=? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            (level.upper(), limit, offset)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM logs ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            (limit, offset)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.post("/logs")
def add_log(body: dict):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    conn.execute("INSERT INTO logs (timestamp, trace_id, level, message, metadata) VALUES (?,?,?,?,?)",
                 (now, body.get("trace_id", ""), body.get("level", "INFO"),
                  body.get("message", ""), json.dumps(body.get("metadata", {}))))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.get("/traces/{trace_id}")
def get_trace(trace_id: str):
    conn = get_conn()
    row = conn.execute("SELECT * FROM traces WHERE trace_id=?", (trace_id,)).fetchone()
    conn.close()
    if not row:
        return {"trace_id": trace_id, "data": {}}
    d = dict(row)
    try:
        d["data"] = json.loads(d["data"])
    except Exception:
        d["data"] = {}
    return d

@router.get("/audit-logs")
def get_audit_logs(limit: int = Query(50, le=200)):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        try:
            d["changes"] = json.loads(d["changes"])
        except Exception:
            d["changes"] = {}
        result.append(d)
    return result

@router.post("/logs/clear")
def clear_logs():
    conn = get_conn()
    conn.execute("DELETE FROM logs")
    conn.execute("DELETE FROM traces")
    conn.commit()
    conn.close()
    return {"cleared": True}
