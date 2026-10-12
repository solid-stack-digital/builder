import { parse } from "yaml";
import { anonymousVolumeServices } from "./composition/composeVolumes.js";
import { spawn } from "node:child_process";
import { ScriptError } from "../errors/ScriptError.js";
import { resolveProjectDir } from "../utils/paths.js";
import { setTearingDown } from "./composeCleanup.js";

export interface TeardownOptions {
  removeVolumes?: boolean;
  anonymousVolumeServices?: string[];
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

    if (!removeVolumes) {
      const services = yamlConfig.trim() ? anonymousVolumeServices(parse(yamlConfig)?.services ?? {}) : options.anonymousVolumeServices ?? [];
      if (services.length) await runSpawn("docker", [...baseArgs, "rm", "-s", "-f", "-v", ...services], absProjectDir, inputData, true, 15_000);
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

    if (result.error || result.status !== 0) {
      const detail = result.error?.message ?? `exit code ${result.status ?? "unknown"}`;
      throw new ScriptError(
        `Failed to tear down Compose project in ${absProjectDir} after two attempts: ${detail}`,
        result.error ? { cause: result.error } : undefined,
      );
    }
  } finally {
    setTearingDown(false);
  }
}
