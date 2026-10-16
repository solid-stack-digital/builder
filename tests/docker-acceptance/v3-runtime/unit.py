import json
import os
from pathlib import Path
if os.environ.get("EXEC_MODE") != "test" or os.environ.get("INFRA_MODE") != "isolated":
    raise SystemExit(11)
markers = Path(os.environ.get("MARKER_DIR", "/markers"))
markers.mkdir(parents=True, exist_ok=True)
(markers / "unit-completed.json").write_text(json.dumps({"nonce": os.environ.get("NONCE", "")}))
raise SystemExit(int(os.environ.get("EXIT_STATUS", "0")))
