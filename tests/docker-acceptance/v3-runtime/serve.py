import http.server
import json
import os
import urllib.request
from pathlib import Path

role = os.environ.get("ROLE", "main")
port = int(os.environ.get("PORT", "3100"))
markers = Path(os.environ.get("MARKER_DIR", "/markers"))
markers.mkdir(parents=True, exist_ok=True)
nonce = os.environ.get("NONCE", "")
(markers / f"started-{role}.json").write_text(json.dumps({"role": role, "nonce": nonce}))
required = [item for item in os.environ.get("READY_AFTER", "").split(",") if item]
internal_url = os.environ.get("CHECK_INTERNAL_URL")
allow = [item for item in os.environ.get("ENV_KEYS", "").split(",") if item]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            ready = all((markers / item).exists() for item in required)
            if ready and internal_url:
                try:
                    with urllib.request.urlopen(internal_url, timeout=1) as response:
                        ready = response.status == 200
                    if ready:
                        (markers / f"internal-{role}.json").write_text(json.dumps({"nonce": nonce}))
                except Exception:
                    ready = False
            status, body = (200, {"ready": True}) if ready else (503, {"ready": False})
        elif self.path == "/role":
            status, body = 200, {"role": role, "nonce": nonce}
        elif self.path == "/env":
            status, body = 200, {key: os.environ.get(key) for key in allow}
        else:
            status, body = 404, {"error": "not found"}
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *_args):
        pass

http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
