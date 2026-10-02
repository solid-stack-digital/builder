import { spawn } from "node:child_process";
import os from "node:os";
import { ScriptError } from "../errors/ScriptError.js";
import { resolveProjectDir } from "../utils/paths.js";
import { registerActiveCompose, setActiveChild } from "./composeCleanup.js";

export interface RunComposeOptions {
  removeVolumes?: boolean;
}

export async function runCompose(
  args: string[],
  yamlConfig: string,
  projectDir: string,
  options: RunComposeOptions = {}
): Promise<number> {
  const absProjectDir = resolveProjectDir(projectDir);
  const unregister = registerActiveCompose(yamlConfig, absProjectDir, {
    removeVolumes: options.removeVolumes ?? false,
  });

  return new Promise<number>((resolve, reject) => {
    let child;
    try {
      child = spawn(
        "docker",
        ["compose", "--project-directory", absProjectDir, "-f", "-", ...args],
        {
          cwd: absProjectDir,
          stdio: ["pipe", "inherit", "inherit"],
        }
      );
    } catch (err: any) {
      unregister();
      return reject(
        new ScriptError(`Failed to spawn docker compose: ${err.message}`, {
          cause: err,
        })
      );
    }

    setActiveChild(child);

    child.stdin?.on("error", () => {
      // Child process may have closed stdin or exited early
    });

    if (child.stdin) {
      child.stdin.write(yamlConfig);
      child.stdin.end();
    }

    child.on("error", (err) => {
      setActiveChild(null);
      unregister();
      reject(
        new ScriptError(`Failed to run docker compose: ${err.message}`, {
          cause: err,
        })
      );
    });

    child.on("close", (code, signal) => {
      setActiveChild(null);
      unregister();

      if (signal) {
        const signalNumber = os.constants.signals[signal] ?? 0;
        resolve(128 + signalNumber);
      } else {
        resolve(code ?? 1);
      }
    });
  });
}
