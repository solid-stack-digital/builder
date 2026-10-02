import { spawnSync } from "node:child_process";
import os from "node:os";
import { ScriptError } from "../errors/ScriptError.js";
import { resolveProjectDir } from "../utils/paths.js";
import { registerActiveCompose } from "./composeCleanup.js";

export function runCompose(
  args: string[],
  yamlConfig: string,
  projectDir: string
): number {
  const absProjectDir = resolveProjectDir(projectDir);
  const unregister = registerActiveCompose(yamlConfig, absProjectDir);

  try {
    const runResult = spawnSync(
      "docker",
      ["compose", "--project-directory", absProjectDir, "-f", "-", ...args],
      {
        cwd: absProjectDir,
        input: yamlConfig,
        stdio: ["pipe", "inherit", "inherit"],
        encoding: "utf-8",
      }
    );

    if (runResult.error) {
      throw new ScriptError(
        `Failed to run docker compose: ${runResult.error.message}`,
        { cause: runResult.error }
      );
    }

    if (runResult.signal) {
      const signalNumber = os.constants.signals[runResult.signal] ?? 0;
      return 128 + signalNumber;
    }

    return runResult.status ?? 1;
  } finally {
    unregister();
  }
}
