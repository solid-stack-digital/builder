import { spawn } from "node:child_process";
import pc from "picocolors";
import { resolveProjectDir } from "../utils/paths.js";
import { setTearingDown } from "./composeCleanup.js";

export interface TeardownOptions {
  removeVolumes?: boolean;
  projectName?: string;
  silent?: boolean;
}

function runSpawn(
  executable: string,
  args: string[],
  cwd: string,
  input?: string,
  silent = false,
  timeoutMs = 60_000
): Promise<{ status: number | null; error?: Error }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(executable, args, {
        cwd,
        stdio: [
          input ? "pipe" : "ignore",
          silent ? "ignore" : "inherit",
          silent ? "ignore" : "inherit",
        ],
      });
    } catch (err: any) {
      return resolve({ status: null, error: err });
    }

    let timer: NodeJS.Timeout | null = null;
    if (timeoutMs) {
      timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve({
          status: null,
          error: new Error(`Teardown timed out after ${timeoutMs}ms`),
        });
      }, timeoutMs);
      timer.unref();
    }

    if (input && child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.write(input);
      child.stdin.end();
    }

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ status: null, error: err });
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ status: code });
    });
  });
}

export async function teardownCompose(
  yamlConfig: string,
  projectDir: string,
  options: TeardownOptions = {}
): Promise<void> {
  const absProjectDir = resolveProjectDir(projectDir);
  const removeVolumes = options.removeVolumes ?? true;
  const silent = Boolean(options.silent);

  setTearingDown(true);
  try {
    const baseArgs: string[] = ["compose"];
    if (options.projectName) {
      baseArgs.push("-p", options.projectName);
    } else {
      baseArgs.push("--project-directory", absProjectDir, "-f", "-");
    }

    const inputData = options.projectName ? undefined : yamlConfig;

    // H4: Targeted anonymous volume cleanup before down when named volumes are preserved
    if (!removeVolumes) {
      // Remove anonymous volumes attached to app containers without deleting named database volumes
      const rmArgs = [...baseArgs, "rm", "-f", "-v", "app"];
      await runSpawn("docker", rmArgs, absProjectDir, inputData, true, 15_000);
    }

    const downArgs = [...baseArgs, "down"];
    if (removeVolumes) {
      downArgs.push("-v");
    }
    downArgs.push("--remove-orphans");

    let result = await runSpawn(
      "docker",
      downArgs,
      absProjectDir,
      inputData,
      silent,
      60_000
    );

    // Retry once if down failed (e.g. active network endpoints race condition)
    if (result.error || result.status !== 0) {
      await new Promise((r) => setTimeout(r, 1000));
      result = await runSpawn(
        "docker",
        downArgs,
        absProjectDir,
        inputData,
        silent,
        60_000
      );
    }

    if (result.error) {
      if (!silent) {
        console.error(
          pc.red(`Failed to run docker compose down: ${result.error.message}`)
        );
      }
    } else if (result.status !== 0 && !silent) {
      console.error(
        pc.red(
          `Docker compose down exited with non-zero status code: ${result.status}`
        )
      );
    }
  } finally {
    setTearingDown(false);
  }
}
