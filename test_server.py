"""Run: python test_server.py  (uses a temporary database)."""
import json
import os
import tempfile
import threading
import urllib.error
import urllib.request

os.environ["CAUSACH_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")
import server  # noqa: E402  (must import after setting CAUSACH_DB)

httpd = server.make_server(0)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{httpd.server_port}"


def call(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


assert call("GET", "/api/health")[0] == 200
status, body = call("GET", "/api/state")
state = json.loads(body)
assert status == 200 and len(state["schools"]) == 5 and state["transfers"] == []

loan = {"schoolId": "s1", "titleId": "tv1", "student": "Lê Văn C", "className": "1A", "status": "requested"}
status, body = call("POST", "/api/loans", loan)
created = json.loads(body)
assert status == 201 and created["id"] and created["student"] == "Lê Văn C"

assert call("POST", "/api/loans", {**loan, "status": "stolen"})[0] == 400
assert call("POST", "/api/loans", {**loan, "admin": True})[0] == 400
assert call("POST", "/api/stock", {"schoolId": "s1", "titleId": "tv1", "need": -1, "have": 0, "shelf": 0})[0] == 400
assert call("POST", "/api/schools", {"name": "x"})[0] == 404  # read-only collection

status, body = call("PATCH", f"/api/loans/{created['id']}", {"status": "borrowed"})
assert status == 200 and json.loads(body)["status"] == "borrowed" and json.loads(body)["student"] == "Lê Văn C"
assert call("PATCH", "/api/loans/nope", {"status": "borrowed"})[0] == 404

assert call("GET", "/server.py")[0] == 404
assert call("GET", "/test.db")[0] == 404
assert call("GET", "/index.html")[0] in (200, 404)  # static serving works once the page exists

httpd.shutdown()
print("server ok")
