import json
import os
import urllib.request
from pathlib import Path
markers = Path(os.environ.get("MARKER_DIR", "/markers"))
markers.mkdir(parents=True, exist_ok=True)
nonce = os.environ.get("NONCE", "")
(markers / "tester-started.json").write_text(json.dumps({"nonce": nonce}))
if "EXEC_MODE" in os.environ or "INFRA_MODE" in os.environ:
    raise SystemExit(11)
for name in [item for item in os.environ.get("REQUIRED_MARKERS", "").split(",") if item]:
    file = markers / name
    if not file.exists() or json.loads(file.read_text()).get("nonce") != nonce:
        print(f"missing or stale marker: {name}", flush=True)
        raise SystemExit(11)
for url in [item for item in os.environ.get("CHECK_URLS", "").split(",") if item]:
    with urllib.request.urlopen(url, timeout=3) as response:
        if response.status != 200:
            raise SystemExit(11)
(markers / "tester-completed.json").write_text(json.dumps({"nonce": nonce}))
raise SystemExit(int(os.environ.get("EXIT_STATUS", "0")))
