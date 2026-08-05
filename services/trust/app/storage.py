"""SQLite identity store.

Keeps ANIMA's Trust Service fully self-contained: identities and their face
encodings live in a local SQLite database. No ORM — stdlib sqlite3 only.
"""

import json
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional

from . import config

_LOCAL = threading.local()


def _conn() -> sqlite3.Connection:
    if getattr(_LOCAL, "conn", None) is None:
        conn = sqlite3.connect(str(config.DB_PATH), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        _LOCAL.conn = conn
    return _LOCAL.conn


def init_db() -> None:
    with _conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS identities (
                subject_id   TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                metadata     TEXT NOT NULL DEFAULT '{}',
                encodings    TEXT NOT NULL DEFAULT '[]',
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            )
            """
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def upsert_identity(subject_id: str, display_name: str, metadata: dict, encodings: List[List[float]]) -> None:
    now = _now()
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO identities (subject_id, display_name, metadata, encodings, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(subject_id) DO UPDATE SET
                display_name=excluded.display_name,
                metadata=excluded.metadata,
                encodings=excluded.encodings,
                updated_at=excluded.updated_at
            """,
            (subject_id, display_name, json.dumps(metadata), json.dumps(encodings), now, now),
        )


def get_identity(subject_id: str) -> Optional[dict]:
    row = _conn().execute("SELECT * FROM identities WHERE subject_id = ?", (subject_id,)).fetchone()
    return dict(row) if row else None


def list_identities() -> List[dict]:
    rows = _conn().execute("SELECT * FROM identities ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def delete_identity(subject_id: str) -> bool:
    with _conn() as conn:
        cur = conn.execute("DELETE FROM identities WHERE subject_id = ?", (subject_id,))
    return cur.rowcount > 0


def load_encoding_registry() -> Dict[str, List[List[float]]]:
    """subject_id -> list of 128-d encodings. Used for global matching."""
    registry: Dict[str, List[List[float]]] = {}
    for row in _conn().execute("SELECT subject_id, encodings FROM identities").fetchall():
        encodings = json.loads(row["encodings"])
        if encodings:
            registry[row["subject_id"]] = encodings
    return registry
