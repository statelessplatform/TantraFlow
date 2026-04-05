"""
Real workflow executor — replaces the 2ms fake.

Architecture
============
execute_workflow_async(workflow_id, input_text, output_dir)
  └─ loads workflow definition (nodes + edges)
  └─ topologically sorts nodes (respects serial dependencies)
  └─ for each node:
       ├─ resolves agent + model via _resolve_llm (same logic as chat)
       ├─ calls the real LLM (Ollama / LM Studio / OpenAI-compat) via httpx
       ├─ accumulates output as context for the next node
       └─ writes per-node span into the trace
  └─ writes final output to:
       ├─ executions.output  (DB)
       ├─ data/outputs/<trace_id>/output.md  (file on disk)
       └─ data/outputs/<trace_id>/<node>.txt (per-node file)

Output routing (node type tag in definition):
  node.output_type == "html"   → saved as .html
  node.output_type == "pdf"    → saved as .pdf (WeasyPrint if available, else .html)
  node.output_type == "email"  → logged as pending (SMTP config needed)
  (default)                    → saved as .md / .txt
"""

import asyncio
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

try:
    from weasyprint import HTML as WeasyHTML
    HAS_WEASYPRINT = True
except ImportError:
    HAS_WEASYPRINT = False


# ── Paths — import from db so there is one canonical source ──────────────────
import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(__file__)))
from db import DATA_DIR, OUTPUT_DIR, get_conn as _get_conn  # noqa: E402


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── LLM call ──────────────────────────────────────────────────────────────────

async def _call_llm(model: str, base_url: str, source_type: str,
                    messages: list, timeout: float = 600.0) -> str:
    """Call LLM, return full response string. Not streaming — returns complete text."""
    if not HAS_HTTPX:
        return (
            f"[Simulated — httpx not installed] Model={model}. "
            f"Run: pip install httpx. Input: {messages[-1]['content'][:80]}"
        )

    if not base_url:
        return (
            f"[No LLM source configured] Model={model}. "
            "Go to Models → Add Source and add your Ollama or LM Studio URL."
        )

    if source_type == "ollama":
        url = f"{base_url.rstrip('/')}/api/chat"
        # Use separate connect timeout (10s) from read timeout (user-specified).
        # This distinguishes "Ollama not running" (ConnectError fast)
        # from "model is slow" (ReadTimeout after generating starts).
        client_timeout = httpx.Timeout(
            connect=10.0,    # fail fast if Ollama is not running
            read=timeout,    # wait up to `timeout` for the full response
            write=30.0,
            pool=10.0,
        )
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            # Keep model in memory between nodes — avoids cold-start on every call
            "keep_alive": "10m",
            # Options to speed up generation
            "options": {
                "num_predict": 4096,   # cap output tokens
                "temperature": 0.7,
            }
        }
        try:
            async with httpx.AsyncClient(timeout=client_timeout) as client:
                r = await client.post(url, json=payload)
                r.raise_for_status()
                data = r.json()
                return data.get("message", {}).get("content", "") or str(data)
        except httpx.ConnectError:
            return (
                f"[LLM ERROR] Cannot connect to Ollama at {base_url}. "
                "Is Ollama running? Start it with: ollama serve"
            )
        except httpx.ReadTimeout:
            return (
                f"[LLM ERROR] ReadTimeout after {timeout:.0f}s — model '{model}' is too slow. "
                "Fix: use llama3.2:3b or gemma2:2b, or reduce task scope in the input."
            )
        except httpx.HTTPStatusError as e:
            body = ""
            try: body = e.response.text[:200]
            except: pass
            return (
                f"[LLM ERROR] Ollama HTTP {e.response.status_code}: {body}. "
                f"Is the model '{model}' pulled? Run: ollama pull {model}"
            )
        except Exception as e:
            return f"[LLM ERROR] {type(e).__name__}: {e}"
    else:
        # OpenAI-compatible (LM Studio, openai_compat)
        url = f"{base_url.rstrip('/')}/v1/chat/completions"
        payload = {"model": model, "messages": messages, "stream": False}
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.post(url, json=payload)
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"]
        except httpx.ConnectError:
            return (
                f"[LLM ERROR] Cannot connect to {base_url}. "
                "Is LM Studio running with the local server enabled?"
            )
        except httpx.HTTPStatusError as e:
            body = ""
            try: body = e.response.text[:200]
            except: pass
            return f"[LLM ERROR] HTTP {e.response.status_code}: {body}"
        except Exception as e:
            return f"[LLM ERROR] {type(e).__name__}: {e}"


# ── Resolve LLM for a node ────────────────────────────────────────────────────

def _resolve_node_llm(node: dict, conn: sqlite3.Connection) -> tuple:
    """Returns (model, base_url, source_type, source_name)."""
    agent_id = node.get("agent_id")
    node_model_override = node.get("model") or ""

    agent = None
    if agent_id:
        row = conn.execute("SELECT * FROM agents WHERE id=?", (agent_id,)).fetchone()
        if row:
            agent = dict(row)

    # Priority: node model override > agent's saved model > global default setting
    chosen_model = node_model_override or (agent["llm_model"] if agent else "") or ""
    agent_source = agent["llm_source"] if agent else ""

    # Find the best source row:
    # 1. Match by source name (e.g. "Ollama Local")
    # 2. Match by source type (e.g. "ollama")
    # 3. Fall back to any active source
    src = None
    if agent_source:
        src = conn.execute(
            "SELECT * FROM model_sources WHERE name=? AND is_active=1", (agent_source,)
        ).fetchone()
    if not src and agent_source:
        src = conn.execute(
            "SELECT * FROM model_sources WHERE type=? AND is_active=1", (agent_source,)
        ).fetchone()
    if not src:
        # Use whatever active source exists
        src = conn.execute(
            "SELECT * FROM model_sources WHERE is_active=1 LIMIT 1"
        ).fetchone()

    base_url    = src["base_url"] if src else ""
    source_type = src["type"]     if src else "ollama"
    sname       = src["name"]     if src else "unknown"

    # Resolve model: agent model > global default > first model we know about
    if not chosen_model:
        setting = conn.execute(
            "SELECT value FROM settings WHERE key='default_model'"
        ).fetchone()
        chosen_model = (setting["value"] if setting else "") or ""

    if not chosen_model:
        # Last resort: use "llama3.2" as a sensible default for Ollama
        chosen_model = "llama3.2"

    sys_prompt = ""
    if agent and agent.get("skills_md", "").strip():
        sys_prompt = agent["skills_md"]

    return chosen_model, base_url, source_type, sname, sys_prompt


# ── Topology sort (Kahn's algorithm) ─────────────────────────────────────────

def _topo_sort(nodes: list, edges: list) -> list:
    """Returns nodes in execution order respecting edge dependencies."""
    id_to_node = {n["id"]: n for n in nodes}
    in_degree   = {n["id"]: 0 for n in nodes}
    children    = {n["id"]: [] for n in nodes}

    for e in edges:
        children[e["source"]].append(e["target"])
        in_degree[e["target"]] = in_degree.get(e["target"], 0) + 1

    queue  = [nid for nid, deg in in_degree.items() if deg == 0]
    result = []
    while queue:
        nid = queue.pop(0)
        result.append(id_to_node[nid])
        for child in children[nid]:
            in_degree[child] -= 1
            if in_degree[child] == 0:
                queue.append(child)

    # Include any disconnected nodes not reached
    seen = {n["id"] for n in result}
    for n in nodes:
        if n["id"] not in seen:
            result.append(n)

    return result


# ── Output writers ────────────────────────────────────────────────────────────

import re as _re





def _strip_fences(text: str) -> str:
    """Remove markdown code fences LLMs add around HTML/JSON/code output.
    
    Handles: ```html, ```python, ```json, ``` (no lang), with or without trailing newline.
    """
    import re as _r
    t = text.strip()
    t = _r.sub(r'^```[a-zA-Z0-9]*[\r\n]+', '', t)   # strip opening fence line
    t = _r.sub(r'[\r\n]*```\s*$', '', t)              # strip closing fence
    return t.strip()


def _ensure_html(content: str) -> str:
    """Guarantee content is a clean, renderable HTML document.
    
    Handles three cases the LLM may produce:
      1. Clean HTML starting with <!DOCTYPE html> or <html — use as-is
      2. HTML wrapped in ```html ... ``` fences — strip fences, use HTML
      3. Plain markdown text — convert headings/lists/bold then wrap in HTML shell
    """
    import re as _r

    # Strip any markdown fences first
    stripped = _strip_fences(content)

    # Case 1 & 2: already HTML
    if _r.match(r'\s*<!DOCTYPE', stripped, _r.IGNORECASE) or _r.match(r'\s*<html', stripped, _r.IGNORECASE):
        return stripped

    # Case: partial HTML (starts with a block element)
    if _r.match(r'\s*<(div|section|article|main|header|nav|p|h[1-6]|table|ul|ol)', stripped, _r.IGNORECASE):
        return (
            '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
            '<style>\n'
            'body{font-family:"Helvetica Neue",Arial,sans-serif;max-width:960px;margin:48px auto;'
            'line-height:1.7;color:#1a1a1a;padding:0 24px}'
            'h1{font-size:2em;color:#0a2342;border-bottom:2px solid #0066cc;padding-bottom:10px}'
            'h2{font-size:1.35em;color:#0066cc;margin-top:1.8em}'
            'h3{font-size:1.1em;margin-top:1.4em}'
            'p{margin:.9em 0}'
            'table{width:100%;border-collapse:collapse;margin:1.2em 0}'
            'th{background:#0a2342;color:#fff;padding:8px 12px;text-align:left}'
            'td{padding:7px 12px;border-bottom:1px solid #e5e5e5}'
            'tr:nth-child(even) td{background:#f8f9fc}'
            'pre,code{font-family:"Courier New",monospace;background:#f4f4f4;border-radius:4px}'
            'pre{padding:12px;overflow-x:auto}'
            'code{padding:2px 6px}'
            '\n</style>\n</head>\n<body>\n'
            + stripped +
            '\n</body>\n</html>'
        )

    # Case 3: Plain text / Markdown — basic conversion
    md = stripped
    md = _r.sub(r'^### (.+)$', r'<h3>\1</h3>', md, flags=_r.M)
    md = _r.sub(r'^## (.+)$',  r'<h2>\1</h2>', md, flags=_r.M)
    md = _r.sub(r'^# (.+)$',   r'<h1>\1</h1>', md, flags=_r.M)
    md = _r.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', md)
    md = _r.sub(r'\*(.+?)\*',       r'<em>\1</em>', md)
    md = _r.sub(r'^[-*] (.+)$', r'<li>\1</li>', md, flags=_r.M)
    # Wrap consecutive <li> blocks in <ul>
    md = _r.sub(r'(<li>[^\n]+</li>\n?)+', lambda m: '<ul>' + m.group(0) + '</ul>', md)
    # Wrap bare text blocks in <p>
    lines = []
    for block in _r.split(r'\n{2,}', md):
        b = block.strip()
        if not b:
            continue
        if _r.match(r'<[a-zA-Z]', b):
            lines.append(b)
        else:
            lines.append(f'<p>{b}</p>')
    body = '\n'.join(lines)

    return (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        '<style>\n'
        'body{font-family:"Helvetica Neue",Arial,sans-serif;max-width:900px;margin:60px auto;'
        'line-height:1.8;color:#1a1a1a;padding:0 24px}'
        'h1{font-size:2em;color:#0a2342;border-bottom:2px solid #0066cc;padding-bottom:10px}'
        'h2{font-size:1.35em;color:#0066cc;margin-top:2em}'
        'h3{font-size:1.1em;margin-top:1.4em}'
        'p{margin:1em 0}'
        'ul{margin:.8em 0;padding-left:1.4em}'
        'li{margin-bottom:.3em}'
        'strong{color:#0a2342}'
        'pre,code{font-family:monospace;background:#f4f4f4;border-radius:4px}'
        'pre{padding:12px}'
        'code{padding:2px 6px}'
        '\n</style>\n</head>\n<body>\n'
        + body +
        '\n</body>\n</html>'
    )


def _write_output(run_dir: Path, filename: str, content: str,
                  output_type: str = "text") -> Path:
    """
    Write agent output to disk in the correct file format.

    Key behaviours
    --------------
    - Strips ``` fences LLMs add even when told not to
    - Converts markdown → styled HTML when output_type is html/pdf
    - Wraps partial HTML in a full document shell
    - Makes .sh / .py files executable on Unix
    - Pretty-prints JSON when valid; saves raw text otherwise
    - Falls back to .html when WeasyPrint is not installed for PDF
    """
    import re as _re, stat as _stat, json as _json

    run_dir.mkdir(parents=True, exist_ok=True)

    # ── HTML ──────────────────────────────────────────────────────────────────
    if output_type == "html":
        path = run_dir / filename.replace(".txt", ".html")
        path.write_text(_ensure_html(content), encoding="utf-8")

    # ── PDF (HTML → WeasyPrint) ───────────────────────────────────────────────
    elif output_type == "pdf":
        clean   = _ensure_html(content)
        html_path = run_dir / filename.replace(".txt", ".html")

        # If the LLM already embedded @page / print rules, use its HTML directly;
        # otherwise wrap in the enterprise PDF shell.
        if "@page" in clean or "weasyprint" in clean.lower():
            final_html = clean
        else:
            final_html = (
                '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
                '<style>\n'
                '  @page { margin: 2.5cm 2cm; }\n'
                '  body { font-family: "Helvetica Neue", Arial, sans-serif;\n'
                '         font-size: 10.5pt; line-height: 1.65; color: #1a1a1a; }\n'
                '  h1 { font-size: 22pt; color: #0a2342;\n'
                '       border-bottom: 3px solid #0066cc; padding-bottom: 10pt; }\n'
                '  h2 { font-size: 14pt; color: #0066cc; margin-top: 18pt;\n'
                '       border-left: 4px solid #0066cc; padding-left: 8pt; }\n'
                '  h3 { font-size: 11pt; color: #333; margin-top: 12pt; }\n'
                '  table { width: 100%; border-collapse: collapse; margin: 12pt 0; }\n'
                '  th { background: #0a2342; color: white; padding: 7pt 10pt;\n'
                '       font-size: 9.5pt; text-align: left; }\n'
                '  td { padding: 6pt 10pt; border-bottom: 1px solid #e0e0e0; }\n'
                '  tr:nth-child(even) td { background: #f8f9fc; }\n'
                '  pre, code { font-family: "Courier New", monospace;\n'
                '              font-size: 9pt; background: #f4f4f4; }\n'
                '  pre { padding: 10pt; border-radius: 4pt; }\n'
                '</style>\n</head>\n<body>\n'
                + clean +
                '\n</body>\n</html>'
            )

        html_path.write_text(final_html, encoding="utf-8")

        if HAS_WEASYPRINT:
            pdf_path = run_dir / filename.replace(".txt", ".pdf")
            try:
                WeasyHTML(string=final_html, base_url=str(run_dir)).write_pdf(str(pdf_path))
                return pdf_path
            except Exception as _pdf_err:
                import logging as _logging
                _logging.warning("WeasyPrint failed: %s", _pdf_err)
                return html_path
        else:
            # No WeasyPrint — deliver the styled HTML with an install note
            note = "<!-- WeasyPrint not installed. Run: pip install weasyprint -->\n"
            html_path.write_text(note + final_html, encoding="utf-8")
            return html_path

    # ── Python script ─────────────────────────────────────────────────────────
    elif output_type in ("py", "python"):
        path = run_dir / filename.replace(".txt", ".py")
        code = _strip_fences(content)
        if not code:
            code = content
        # Ensure shebang is present
        if not code.startswith("#!") and not code.startswith("#!/"):
            code = "#!/usr/bin/env python3\n" + code
        path.write_text(code, encoding="utf-8")
        try:
            path.chmod(path.stat().st_mode | _stat.S_IEXEC | _stat.S_IXGRP | _stat.S_IXOTH)
        except Exception:
            pass

    # ── Shell script ──────────────────────────────────────────────────────────
    elif output_type in ("sh", "bash", "shell"):
        path = run_dir / filename.replace(".txt", ".sh")
        code = _strip_fences(content)
        if not code:
            code = content
        if not code.startswith("#!"):
            code = "#!/usr/bin/env bash\nset -euo pipefail\n\n" + code
        path.write_text(code, encoding="utf-8")
        try:
            path.chmod(path.stat().st_mode | _stat.S_IEXEC | _stat.S_IXGRP | _stat.S_IXOTH)
        except Exception:
            pass

    # ── Windows batch file ────────────────────────────────────────────────────
    elif output_type in ("bat", "batch", "cmd"):
        path = run_dir / filename.replace(".txt", ".bat")
        code = _strip_fences(content)
        if not code:
            code = content
        if not code.lower().startswith("@echo"):
            code = "@echo off\nsetlocal ENABLEEXTENSIONS\n\n" + code
        path.write_text(code, encoding="utf-8")

    # ── CSV data ──────────────────────────────────────────────────────────────
    elif output_type == "csv":
        path = run_dir / filename.replace(".txt", ".csv")
        cleaned = _strip_fences(content)
        path.write_text(cleaned or content, encoding="utf-8")

    # ── JSON data ─────────────────────────────────────────────────────────────
    elif output_type == "json":
        path = run_dir / filename.replace(".txt", ".json")
        stripped = _strip_fences(content)
        try:
            parsed = _json.loads(stripped)
            path.write_text(_json.dumps(parsed, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception:
            path.write_text(stripped or content, encoding="utf-8")

    # ── Plain text / markdown (default) ──────────────────────────────────────
    else:
        path = run_dir / filename
        path.write_text(content, encoding="utf-8")

    return path


# ── Main executor ─────────────────────────────────────────────────────────────

async def execute_workflow_async(
    workflow_id: int,
    input_text: str,
    execution_id: int,
    trace_id: str,
) -> dict:
    """
    Real workflow execution:
    1. Load workflow + agents from DB
    2. Topo-sort nodes
    3. Call LLM for each node, passing previous output as context
    4. Write outputs to disk under data/outputs/<trace_id>/
    5. Update execution record in DB with real output and timing
    """
    conn = _get_conn()
    wf_row = conn.execute("SELECT * FROM workflows WHERE id=?", (workflow_id,)).fetchone()
    if not wf_row:
        conn.close()
        return {"error": "Workflow not found"}

    wf = dict(wf_row)
    try:
        definition = json.loads(wf.get("definition", "{}"))
    except Exception:
        definition = {}

    nodes = definition.get("nodes", [])
    edges = definition.get("edges", [])

    if not nodes:
        conn.close()
        return {"error": "Workflow has no nodes. Add agents in the Builder first."}

    ordered_nodes = _topo_sort(nodes, edges)
    run_dir = OUTPUT_DIR / trace_id
    run_dir.mkdir(parents=True, exist_ok=True)

    spans        = []
    context      = input_text
    node_outputs = {}
    total_tokens = 0
    all_files    = []

    t_start = datetime.now(timezone.utc)

    # ── Model warm-up ping ────────────────────────────────────────────────────
    # Send a tiny "hello" to load the model into GPU/memory BEFORE the first
    # real node runs. This eliminates the cold-start penalty (30-90s on Apple
    # Silicon) that causes Node 1 ReadTimeout.
    first_node = ordered_nodes[0] if ordered_nodes else None
    if first_node and HAS_HTTPX:
        warmup_model, warmup_url, warmup_src, warmup_name, _ = _resolve_node_llm(first_node, conn)
        if warmup_url:
            conn.execute(
                "INSERT INTO logs (timestamp, trace_id, level, message, metadata) VALUES (?,?,?,?,?)",
                (_now(), trace_id, "INFO",
                 f"[WARMUP] Loading model '{warmup_model}' into memory…",
                 json.dumps({"model": warmup_model, "source": warmup_name}))
            )
            conn.commit()
            try:
                warmup_timeout = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=5.0)
                async with httpx.AsyncClient(timeout=warmup_timeout) as client:
                    if warmup_src == "ollama":
                        await client.post(
                            f"{warmup_url.rstrip('/')}/api/chat",
                            json={"model": warmup_model, "messages": [{"role":"user","content":"hi"}],
                                  "stream": False, "keep_alive": "10m",
                                  "options": {"num_predict": 1}}
                        )
                    else:
                        await client.post(
                            f"{warmup_url.rstrip('/')}/v1/chat/completions",
                            json={"model": warmup_model,
                                  "messages": [{"role":"user","content":"hi"}],
                                  "max_tokens": 1}
                        )
                conn.execute(
                    "INSERT INTO logs (timestamp, trace_id, level, message, metadata) VALUES (?,?,?,?,?)",
                    (_now(), trace_id, "INFO",
                     f"[WARMUP] Model '{warmup_model}' loaded and ready",
                     json.dumps({"model": warmup_model}))
                )
                conn.commit()
            except Exception as we:
                # Warmup failure is non-fatal — log and continue
                conn.execute(
                    "INSERT INTO logs (timestamp, trace_id, level, message, metadata) VALUES (?,?,?,?,?)",
                    (_now(), trace_id, "WARNING",
                     f"[WARMUP] Could not pre-load model: {we}",
                     json.dumps({"error": str(we)}))
                )
                conn.commit()

    for i, node in enumerate(ordered_nodes):
        node_id    = node.get("id", f"node_{i}")
        node_label = node.get("label", f"Node {i+1}")
        output_type = node.get("output_type", "text")

        model, base_url, source_type, source_name, sys_prompt = \
            _resolve_node_llm(node, conn)

        # ── Build prompt for this node ─────────────────────────────────────────
        # task_instruction is set per-node in library workflows — it tells each
        # agent exactly what to produce (more specific than a generic fallback)
        task_instruction = node.get("task_instruction", "")

        # Maximum chars of predecessor output to include as context.
        # This prevents prompt-size explosion which causes ReadTimeout on later nodes.
        # 6000 chars ≈ ~1500 tokens — enough context without overwhelming the model.
        MAX_CONTEXT_CHARS = 6000

        # Collect outputs from all predecessor nodes (respects the DAG edges)
        predecessors = [e["source"] for e in edges if e["target"] == node_id]

        if predecessors:
            pred_parts = []
            for p in predecessors:
                pred_label = next(
                    (n.get("label", p) for n in ordered_nodes if n["id"] == p), p
                )
                pred_output = node_outputs.get(p, "")
                # Skip error outputs — they add noise without value
                if pred_output and not pred_output.startswith("[LLM ERROR]"):
                    # Truncate long predecessor outputs to avoid prompt explosion.
                    # This is the #1 cause of ReadTimeout on nodes 3+.
                    if len(pred_output) > MAX_CONTEXT_CHARS:
                        truncated = pred_output[:MAX_CONTEXT_CHARS]
                        pred_output = (
                            truncated +
                            f"\n\n[... output truncated at {MAX_CONTEXT_CHARS} chars "
                            f"to stay within model context limits. Full output in "
                            f"{i:02d}_{pred_label.replace(' ','_')}.txt ...]"
                        )
                    pred_parts.append(
                        f"=== Output from: {pred_label} ===\n{pred_output}"
                    )
                elif pred_output.startswith("[LLM ERROR]"):
                    # Include a brief note that the predecessor failed
                    pred_parts.append(
                        f"=== Output from: {pred_label} ===\n"
                        f"[Previous node failed — proceed with your best judgment "
                        f"based on the original task below.]"
                    )
            pred_context = "\n\n".join(pred_parts)

            if task_instruction:
                user_content = (
                    f"ORIGINAL TASK:\n{input_text}\n\n"
                    f"PREVIOUS NODE OUTPUTS:\n{pred_context}\n\n"
                    f"YOUR SPECIFIC TASK:\n{task_instruction}\n\n"
                    f"Use the previous outputs as context/input. Produce your deliverable now."
                )
            else:
                user_content = (
                    f"Original task: {input_text}\n\n"
                    f"Previous outputs:\n{pred_context}\n\n"
                    f"Your task: Based on the above, produce your contribution."
                )
        else:
            # First node — receives the raw user input
            if task_instruction:
                user_content = (
                    f"USER REQUEST:\n{input_text}\n\n"
                    f"YOUR TASK:\n{task_instruction}"
                )
            else:
                user_content = input_text

        # Output-type hint appended to the user message so the LLM formats correctly
        output_hints = {
            "html": "\n\nIMPORTANT: Output a COMPLETE self-contained HTML document. No truncation.",
            "pdf":  "\n\nIMPORTANT: Output a COMPLETE print-ready HTML document for PDF export. No truncation.",
            "py":   "\n\nIMPORTANT: Output a COMPLETE, runnable Python script. Include shebang, imports, main() guard, docstrings, and inline comments. No truncation.",
            "sh":   "\n\nIMPORTANT: Output a COMPLETE bash script starting with #!/usr/bin/env bash and set -euo pipefail. Include header comment block, logging, error handling. No truncation.",
            "txt":  "",
            "csv":  "\n\nIMPORTANT: Output ONLY valid CSV data with a header row. No markdown, no explanation — just CSV.",
        }
        hint = output_hints.get(output_type, "")
        if hint:
            user_content += hint

        messages = []
        if sys_prompt:
            messages.append({"role": "system", "content": sys_prompt})
        messages.append({"role": "user", "content": user_content})

        span_start = datetime.now(timezone.utc)

        # Log the dispatch
        conn.execute(
            "INSERT INTO logs (timestamp, trace_id, level, message, metadata) VALUES (?,?,?,?,?)",
            (_now(), trace_id, "INFO",
             f"Executing node '{node_label}' with model={model} source={source_name}",
             json.dumps({"node_id": node_id, "model": model, "source": source_name}))
        )
        conn.commit()

        output = await _call_llm(model, base_url, source_type, messages)
        node_outputs[node_id] = output
        context = output  # last node's output becomes context for next

        span_ms = int((datetime.now(timezone.utc) - span_start).total_seconds() * 1000)
        est_tokens = len(output.split()) + len(user_content.split())
        total_tokens += est_tokens

        # Write node output to disk
        safe_label = "".join(c if c.isalnum() else "_" for c in node_label)
        filename = f"{i+1:02d}_{safe_label}.txt"
        out_path = _write_output(run_dir, filename, output, output_type)
        all_files.append(str(out_path.name))

        spans.append({
            "node_id":    node_id,
            "name":       node_label,
            "model":      model,
            "source":     source_name,
            "output_type": output_type,
            "status":     "ok" if not output.startswith("[LLM ERROR]") else "error",
            "latency_ms": span_ms,
            "tokens":     est_tokens,
            "output":     output[:500],          # truncated for trace
            "file":       out_path.name,
        })

        conn.execute(
            "INSERT INTO logs (timestamp, trace_id, level, message, metadata) VALUES (?,?,?,?,?)",
            (_now(), trace_id, "INFO" if spans[-1]["status"] == "ok" else "ERROR",
             f"Node '{node_label}' completed in {span_ms}ms",
             json.dumps({"tokens": est_tokens, "file": out_path.name}))
        )
        conn.commit()

    # Write combined final output
    final_output = "\n\n---\n\n".join(
        f"## {i+1}. {n.get('label', 'Node')}\n\n{node_outputs.get(n['id'], '')}"
        for i, n in enumerate(ordered_nodes)
    )
    final_path = run_dir / "combined_output.md"
    final_path.write_text(final_output, encoding="utf-8")
    all_files.append("combined_output.md")

    elapsed_ms = int((datetime.now(timezone.utc) - t_start).total_seconds() * 1000)

    # Write manifest
    manifest = {
        "trace_id":     trace_id,
        "workflow":     wf["name"],
        "input":        input_text[:500],
        "nodes_run":    len(ordered_nodes),
        "total_tokens": total_tokens,
        "elapsed_ms":   elapsed_ms,
        "files":        all_files,
        "output_dir":   str(run_dir),
    }
    (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    # Persist trace + update execution
    trace_data = {
        "trace_id":  trace_id,
        "workflow":  wf["name"],
        "input":     input_text,
        "spans":     spans,
        "files":     all_files,
        "output_dir": str(run_dir),
    }
    conn.execute(
        "INSERT OR REPLACE INTO traces (trace_id, execution_id, data) VALUES (?,?,?)",
        (trace_id, execution_id, json.dumps(trace_data))
    )
    conn.execute(
        """UPDATE executions SET status=?, finished_at=?, output=?,
           total_tokens=?, total_cost=? WHERE id=?""",
        ("success", _now(), final_output[:2000], total_tokens,
         round(total_tokens * 0.000002, 6), execution_id)
    )
    conn.commit()
    conn.close()

    return {
        "trace_id":     trace_id,
        "status":       "success",
        "nodes_run":    len(ordered_nodes),
        "total_tokens": total_tokens,
        "elapsed_ms":   elapsed_ms,
        "output":       final_output,
        "files":        all_files,
        "output_dir":   str(run_dir),
    }
