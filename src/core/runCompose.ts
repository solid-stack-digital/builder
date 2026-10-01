import { ScriptError } from "@/errors/ScriptError.js";
import { spawnSync } from "node:child_process";

export function runCompose(
  args: string[],
  yamlConfig: string,
  projectDir: string): number {
  const runResult = spawnSync(
    "docker",
    ["compose", "--project-directory", projectDir, "-f", "-", ...args],
    {
      cwd: projectDir,
      input: yamlConfig,
      stdio: ["pipe", "inherit", "inherit"],
      encoding: "utf-8",
    }
  );

  if (runResult.error) {
    throw new ScriptError(
      `Failed to run docker compose: ${runResult.error.message}`
    );
  }

  return runResult.status ?? (runResult.error ? 1 : 0);
}
