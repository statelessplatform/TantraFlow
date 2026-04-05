"""
Shared database paths and connection factory.

All routers import from here so every module uses the identical
canonical paths regardless of working directory.

  backend/db.py  →  Path(__file__).resolve().parent       = .../backend
                    .parent.parent                         = .../agentic-platform  (repo root)
                    / "data"                               = .../agentic-platform/data
"""

import sqlite3
from pathlib import Path

# ── Canonical paths (import these everywhere) ─────────────────────────────────
REPO_ROOT  = Path(__file__).resolve().parent.parent
DATA_DIR   = REPO_ROOT / "data"
OUTPUT_DIR = DATA_DIR / "outputs"
DB_PATH    = DATA_DIR / "platform.db"


def get_conn() -> sqlite3.Connection:
    """Open a SQLite connection with WAL mode and row_factory set."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)   # safe even on first run
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn
