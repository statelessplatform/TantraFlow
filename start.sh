#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Agentic Platform — Start Script (Linux / macOS)
# ─────────────────────────────────────────────────────────────────────────────
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ╭─────────────────────────────────────────────╮"
echo "  │   Agentic Workflow Builder & Orchestrator   │"
echo "  │   v2.0 · FastAPI + SQLite + Vanilla JS      │"
echo "  ╰─────────────────────────────────────────────╯"
echo ""

# ── Python version check ──────────────────────────────────────────────────────
PY=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
PY_MAJOR=$(echo "$PY" | cut -d. -f1)
PY_MINOR=$(echo "$PY" | cut -d. -f2)

if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; }; then
  echo "  ✗ Python 3.10–3.13 is required. Found: Python $PY"
  echo "    Install from https://python.org or use pyenv."
  exit 1
fi

if [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -ge 14 ]; then
  echo "  ✗ Python $PY is not yet supported."
  echo ""
  echo "  pydantic-core requires Python 3.10–3.13 (PyO3 limitation)."
  echo "  Please use Python 3.13 or lower."
  echo ""
  echo "  Using pyenv?  Run:  pyenv install 3.13.3 && pyenv local 3.13.3"
  echo "  Using Homebrew?     brew install python@3.13"
  echo ""
  exit 1
fi

echo "  → Python $PY detected  ✓"

# ── Virtual environment ───────────────────────────────────────────────────────
if [ ! -d ".venv" ]; then
  echo "  → Creating virtual environment…"
  python3 -m venv .venv
fi

source .venv/bin/activate

# ── Install dependencies ──────────────────────────────────────────────────────
echo "  → Installing dependencies…"
pip install -q --upgrade pip
pip install -q -r requirements.txt

# ── Data directories ──────────────────────────────────────────────────────────
mkdir -p data/uploads data/skills data/tools

echo ""
echo "  ✓ Ready!"
echo "  ✓ Open http://localhost:8000 in your browser"
echo "  ✓ API docs: http://localhost:8000/docs"
echo ""

cd backend
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload
