from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from db import get_conn

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

router = APIRouter(tags=["Models"])


class ModelSourceCreate(BaseModel):
    name: str
    type: str          # ollama | lmstudio | openai_compat
    base_url: str
    is_active: Optional[int] = 1


# ── Live-fetch helpers ────────────────────────────────────────────────────────

async def _fetch_ollama_models(base_url: str) -> list:
    if not HAS_HTTPX:
        return []
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(f"{base_url.rstrip('/')}/api/tags")
            r.raise_for_status()
            data = r.json()
            return [m["name"] for m in data.get("models", [])]
    except Exception:
        return []


async def _fetch_lmstudio_models(base_url: str) -> list:
    if not HAS_HTTPX:
        return []
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(f"{base_url.rstrip('/')}/v1/models")
            r.raise_for_status()
            data = r.json()
            return [m["id"] for m in data.get("data", [])]
    except Exception:
        return []


async def _fetch_openai_compat_models(base_url: str) -> list:
    if not HAS_HTTPX:
        return []
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(f"{base_url.rstrip('/')}/models")
            r.raise_for_status()
            data = r.json()
            return [m["id"] for m in data.get("data", [])]
    except Exception:
        return []


async def fetch_models_for_source_obj(source: dict) -> list:
    t = source.get("type", "")
    url = source.get("base_url", "")
    if t == "ollama":
        return await _fetch_ollama_models(url)
    elif t == "lmstudio":
        return await _fetch_lmstudio_models(url)
    elif t == "openai_compat":
        return await _fetch_openai_compat_models(url)
    return []


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/models/sources")
def list_sources():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM model_sources ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/models/sources", status_code=201)
def add_source(src: ModelSourceCreate):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO model_sources (name, type, base_url, is_active, created_at) VALUES (?,?,?,?,?)",
        (src.name, src.type, src.base_url, src.is_active, now)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM model_sources WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


@router.put("/models/sources/{source_id}")
def update_source(source_id: int, src: ModelSourceCreate):
    conn = get_conn()
    conn.execute(
        "UPDATE model_sources SET name=?, type=?, base_url=?, is_active=? WHERE id=?",
        (src.name, src.type, src.base_url, src.is_active, source_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM model_sources WHERE id=?", (source_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Source not found")
    return dict(row)


@router.get("/models/sources/{source_id}/models")
async def get_models_for_source(source_id: int):
    """Live-fetch models from the actual LLM server."""
    conn = get_conn()
    row = conn.execute("SELECT * FROM model_sources WHERE id=?", (source_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Source not found")
    source = dict(row)
    models = await fetch_models_for_source_obj(source)
    return {
        "source_id": source_id,
        "source_name": source["name"],
        "source_type": source["type"],
        "base_url": source["base_url"],
        "online": len(models) > 0,
        "models": models,
    }


@router.get("/models")
async def list_all_models():
    """All live models across active sources, flattened."""
    conn = get_conn()
    sources = conn.execute("SELECT * FROM model_sources WHERE is_active=1").fetchall()
    conn.close()
    result = []
    for s in sources:
        src = dict(s)
        models = await fetch_models_for_source_obj(src)
        for m in models:
            result.append({
                "model": m,
                "label": f"{m}  [{src['name']}]",
                "source": src["name"],
                "source_type": src["type"],
                "source_id": src["id"],
                "base_url": src["base_url"],
            })
    return result


@router.delete("/models/sources/{source_id}")
def delete_source(source_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM model_sources WHERE id=?", (source_id,))
    conn.commit()
    conn.close()
    return {"deleted": source_id}


# ── Settings (key/value store) ────────────────────────────────────────────────

@router.get("/settings")
def get_settings():
    conn = get_conn()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


@router.put("/settings")
def update_settings(body: dict):
    conn = get_conn()
    for k, v in body.items():
        conn.execute(
            "INSERT INTO settings (key,value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (k, str(v))
        )
    conn.commit()
    conn.close()
    return {"saved": list(body.keys())}
