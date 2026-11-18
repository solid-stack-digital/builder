import { spawn } from "node:child_process";
import os from "node:os";
import { ScriptError } from "../errors/ScriptError.js";
import { resolveProjectDir } from "../utils/paths.js";
import { registerActiveCompose, setActiveChild } from "./composeCleanup.js";
import { currentOutput } from "./output/index.js";

export interface RunComposeOptions {
  removeVolumes?: boolean;
  timeoutMs?: number;
  /** Internal process boundary for deterministic workflow tests. */
  spawnProcess?: typeof spawn;
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

  const out = currentOutput();
  return new Promise<number>((resolve, reject) => {
    let child;
    try {
      child = (options.spawnProcess??spawn)(
        "docker",
        ["compose", "--project-directory", absProjectDir, "-f", "-", ...args],
        {
          cwd: absProjectDir,
          stdio: ["pipe", ...out.childStdio()],
        }
      );
      out.pipeChild(child);
    } catch (err: any) {
      unregister();
      return reject(
        new ScriptError(`Failed to spawn docker compose: ${err.message}`, {
          cause: err,
        })
      );
    }

    setActiveChild(child);
    let timer: NodeJS.Timeout | undefined;
    if (options.timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new ScriptError(`Compose readiness deadline exceeded after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
      timer.unref();
    }

    child.stdin?.on("error", () => {
      // Child process may have closed stdin or exited early
    });

    if (child.stdin) {
      child.stdin.write(yamlConfig);
      child.stdin.end();
    }

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      setActiveChild(null);
      unregister();
      reject(
        new ScriptError(`Failed to run docker compose: ${err.message}`, {
          cause: err,
        })
      );
    });

    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
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

export interface FollowHandle {
  /** Resolves with the follower's exit status (128+signal when killed). */
  done: Promise<number>;
  /** SIGTERM the follower (no-op once it has exited) and resolve with its status. */
  stop(): Promise<number>;
}

/**
 * Run a secondary Compose command (e.g. `logs --follow`) alongside the primary one.
 * It is not registered as the active child, so signal handling and cleanup stay
 * bound to the primary command.
 */
export function followCompose(
  args: string[],
  yamlConfig: string,
  projectDir: string,
  options: { spawnProcess?: typeof spawn } = {}
): FollowHandle {
  const absProjectDir = resolveProjectDir(projectDir);
  const out = currentOutput();
  let exited = false;
  let child: ReturnType<typeof spawn> | undefined;
  const done = new Promise<number>((resolve) => {
    try {
      child = (options.spawnProcess ?? spawn)(
        "docker",
        ["compose", "--project-directory", absProjectDir, "-f", "-", ...args],
        { cwd: absProjectDir, stdio: ["pipe", ...out.childStdio()] }
      );
    } catch (err: any) {
      out.warn(`Could not follow Compose logs: ${err.message}`);
      exited = true;
      return resolve(1);
    }
    out.pipeChild(child);
    child.stdin?.on("error", () => {});
    child.stdin?.write(yamlConfig);
    child.stdin?.end();
    child.on("error", (err) => {
      exited = true;
      out.warn(`Could not follow Compose logs: ${err.message}`);
      resolve(1);
    });
    child.on("close", (code, signal) => {
      exited = true;
      resolve(signal ? 128 + (os.constants.signals[signal] ?? 0) : code ?? 1);
    });
  });
  return {
    done,
    stop: () => {
      if (!exited && child) {
        try { child.kill("SIGTERM"); } catch { /* already gone */ }
      }
      return done;
    },
  };
}
