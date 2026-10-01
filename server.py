"""BookBridge backend: serves the static site plus a small JSON API backed by SQLite.

Stdlib only. Run:  python server.py [port]      (default 8000)
The client auto-detects the API via GET /api/health; without it, the client falls
back to browser-only mode (localStorage), which is what GitHub Pages uses.
"""
import json
import os
import sqlite3
import sys
import threading
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("BOOKBRIDGE_DB", ROOT / "data.db"))
SEED_PATH = ROOT / "seed.json"
MAX_BODY = 10_000

READ_ONLY = ["schools", "suppliers", "titles"]
# Writable collections: field -> type. POST requires every field, PATCH accepts any subset.
SCHEMA = {
    "stock": {"schoolId": str, "titleId": str, "need": int, "have": int, "shelf": int},
    "shipments": {"supplierId": str, "schoolId": str, "titleId": str, "qty": int, "eta": str, "status": str},
    "transfers": {"fromId": str, "toId": str, "titleId": str, "qty": int, "status": str},
    "loans": {"schoolId": str, "titleId": str, "student": str, "className": str, "status": str},
}
STATUSES = {
    "shipments": {"planned", "shipping", "delivered"},
    "transfers": {"proposed", "accepted", "rejected", "done"},
    "loans": {"requested", "borrowed", "returned", "rejected"},
}

# ponytail: one shared connection behind a global lock; fine for a school/district load,
# switch to a connection per thread (or a real DB server) if write throughput matters.
_lock = threading.Lock()
_db = None


def db():
    global _db
    if _db is None:
        _db = sqlite3.connect(DB_PATH, check_same_thread=False)
        _db.execute("CREATE TABLE IF NOT EXISTS docs (coll TEXT, id TEXT, data TEXT, PRIMARY KEY (coll, id))")
        if not _db.execute("SELECT 1 FROM docs LIMIT 1").fetchone():
            seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
            for coll, rows in seed.items():
                for row in rows:
                    _db.execute("INSERT INTO docs VALUES (?, ?, ?)", (coll, row["id"], json.dumps(row, ensure_ascii=False)))
        _db.commit()
    return _db


def validate(coll, body, partial):
    """Return a clean dict of allowed fields or raise ValueError."""
    fields = SCHEMA[coll]
    if not isinstance(body, dict):
        raise ValueError("body must be a JSON object")
    unknown = set(body) - set(fields)
    if unknown:
        raise ValueError(f"unknown fields: {sorted(unknown)}")
    missing = set(fields) - set(body)
    if missing and not partial:
        raise ValueError(f"missing fields: {sorted(missing)}")
    for key, value in body.items():
        kind = fields[key]
        if kind is int and (isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 100_000):
            raise ValueError(f"{key} must be an integer 0..100000")
        if kind is str and (not isinstance(value, str) or not value.strip() or len(value) > 200):
            raise ValueError(f"{key} must be a non-empty string up to 200 chars")
    if "status" in body and body["status"] not in STATUSES[coll]:
        raise ValueError(f"status must be one of {sorted(STATUSES[coll])}")
    return body


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".json": "application/json"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ValueError("body too large")
        return json.loads(self.rfile.read(length) or b"null")

    def route(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        return parts[1:] if parts[0] == "api" else None

    def do_GET(self):
        parts = self.route()
        if parts is None:
            # Never serve the database, server code or dotfiles as static files.
            name = urlparse(self.path).path.lower()
            if name.endswith((".db", ".py", ".db-journal")) or "/." in name:
                return self.send_error(404)
            return super().do_GET()
        if parts == ["health"]:
            return self.send_json(200, {"ok": True})
        if parts == ["state"]:
            with _lock:
                rows = db().execute("SELECT coll, data FROM docs ORDER BY rowid").fetchall()
            state = {c: [] for c in READ_ONLY + list(SCHEMA)}
            for coll, data in rows:
                state.setdefault(coll, []).append(json.loads(data))
            return self.send_json(200, state)
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        parts = self.route()
        if not parts or len(parts) != 1 or parts[0] not in SCHEMA:
            return self.send_json(404, {"error": "not found"})
        try:
            row = validate(parts[0], self.read_body(), partial=False)
        except ValueError as e:  # json.JSONDecodeError is a ValueError too
            return self.send_json(400, {"error": str(e)})
        row = {"id": uuid.uuid4().hex[:10], **row}
        with _lock:
            db().execute("INSERT INTO docs VALUES (?, ?, ?)", (parts[0], row["id"], json.dumps(row, ensure_ascii=False)))
            db().commit()
        self.send_json(201, row)

    def do_PATCH(self):
        parts = self.route()
        if not parts or len(parts) != 2 or parts[0] not in SCHEMA:
            return self.send_json(404, {"error": "not found"})
        coll, doc_id = parts
        try:
            patch = validate(coll, self.read_body(), partial=True)
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        with _lock:
            found = db().execute("SELECT data FROM docs WHERE coll = ? AND id = ?", (coll, doc_id)).fetchone()
            if not found:
                return self.send_json(404, {"error": "not found"})
            row = {**json.loads(found[0]), **patch}
            db().execute("UPDATE docs SET data = ? WHERE coll = ? AND id = ?", (json.dumps(row, ensure_ascii=False), coll, doc_id))
            db().commit()
        self.send_json(200, row)


def make_server(port):
    # Localhost by default; set BOOKBRIDGE_HOST=0.0.0.0 to serve other machines (no auth yet!).
    return ThreadingHTTPServer((os.environ.get("BOOKBRIDGE_HOST", "127.0.0.1"), port), Handler)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"BookBridge: http://localhost:{port}  (database: {DB_PATH})")
    make_server(port).serve_forever()
