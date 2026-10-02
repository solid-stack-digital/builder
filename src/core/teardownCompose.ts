import { spawnSync } from "node:child_process";
import pc from "picocolors";
import { resolveProjectDir } from "../utils/paths.js";
import { setTearingDown } from "./composeCleanup.js";

export interface TeardownOptions {
  removeVolumes?: boolean;
}

export function teardownCompose(
  yamlConfig: string,
  projectDir: string,
  options: TeardownOptions = {}
): void {
  const absProjectDir = resolveProjectDir(projectDir);
  const removeVolumes = options.removeVolumes ?? true;

  setTearingDown(true);
  try {
    const downArgs = [
      "compose",
      "--project-directory",
      absProjectDir,
      "-f",
      "-",
      "down",
    ];
    if (removeVolumes) {
      downArgs.push("-v");
    }
    downArgs.push("--remove-orphans");

    const runDown = () =>
      spawnSync("docker", downArgs, {
        cwd: absProjectDir,
        input: yamlConfig,
        stdio: ["pipe", "inherit", "inherit"],
        encoding: "utf-8",
      });

    let downResult = runDown();

    // Retry once if failed (e.g. temporary network detachment lock)
    if (downResult.error || downResult.status !== 0) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
      downResult = runDown();
    }

    if (downResult.error) {
      console.error(
        pc.red(`Failed to run docker compose down: ${downResult.error.message}`)
      );
    } else if (downResult.status !== 0) {
      console.error(
        pc.red(
          `Docker compose down exited with non-zero status code: ${downResult.status}`
        )
      );
    }
  } finally {
    setTearingDown(false);
  }
}
