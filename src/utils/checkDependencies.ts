import { spawnSync } from "node:child_process";
import { ScriptError } from "../errors/ScriptError.js";

export function checkDependencies(): void {
  // 1. Check docker compose v2 plugin and PATH
  const composeCheck = spawnSync("docker", ["compose", "version"], {
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (composeCheck.error || composeCheck.status !== 0) {
    throw new ScriptError(
      "Error: Docker Compose v2 is not installed or docker is not in PATH. Please install Docker and Compose v2 first."
    );
  }

  // 2. Verify docker daemon is reachable
  const daemonCheck = spawnSync("docker", ["info"], {
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (daemonCheck.error || daemonCheck.status !== 0) {
    throw new ScriptError(
      "Error: Docker daemon is not running or not accessible. Please start the Docker daemon first."
    );
  }
}
