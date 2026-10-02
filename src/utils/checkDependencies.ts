import { spawnSync } from "node:child_process";
import pc from "picocolors";
import { ScriptError } from "../errors/ScriptError.js";

export function checkDependencies(): void {
  // 1. Check docker compose v2 plugin, PATH, and minimum version >= 2.24.0 (M2)
  const composeCheck = spawnSync(
    "docker",
    ["compose", "version", "--short"],
    {
      stdio: "pipe",
      encoding: "utf-8",
    }
  );

  if (composeCheck.error || composeCheck.status !== 0) {
    throw new ScriptError(
      "Error: Docker Compose v2 is not installed or docker is not in PATH. Please install Docker and Compose v2 first."
    );
  }

  const rawVersion = (composeCheck.stdout || "").trim().replace(/^v/, "");
  const versionParts = rawVersion.split(".").map((p) => parseInt(p, 10));
  const major = versionParts[0] ?? 0;
  const minor = versionParts[1] ?? 0;
  if (major < 2 || (major === 2 && minor < 24)) {
    throw new ScriptError(
      `Error: Docker Compose version >= 2.24.0 is required (found ${rawVersion}). Please upgrade Docker Compose to support optional env_file syntax.`
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

  // 3. Preflight network count check for address pool exhaustion (M10)
  const networkCheck = spawnSync("docker", ["network", "ls", "-q"], {
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (!networkCheck.error && networkCheck.status === 0) {
    const count = (networkCheck.stdout || "")
      .trim()
      .split("\n")
      .filter(Boolean).length;
    if (count > 25) {
      console.warn(
        pc.yellow(
          `\n⚠️ High Docker Network Count Warning: Detected ${count} networks. Docker's default address pool can become exhausted, resulting in "could not find an available, non-overlapping IPv4 address pool" errors.\n` +
            `To resolve, run "builder prune" or "docker network prune -f", or configure default-address-pools in /etc/docker/daemon.json.\n`
        )
      );
    }
  }
}
