import json
import os
import urllib.request
from pathlib import Path
role = os.environ.get("ROLE", "job")
markers = Path(os.environ.get("MARKER_DIR", "/markers"))
markers.mkdir(parents=True, exist_ok=True)
url = os.environ.get("WAIT_URL")
if url:
    with urllib.request.urlopen(url, timeout=3) as response:
        if response.status != 200:
            raise SystemExit(11)
status = int(os.environ.get("EXIT_STATUS", "0"))
if status == 0:
    (markers / f"completed-{role}.json").write_text(json.dumps({"role": role, "nonce": os.environ.get("NONCE", "")}))
raise SystemExit(status)
