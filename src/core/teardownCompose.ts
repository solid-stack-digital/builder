import pc from "picocolors";

import { spawnSync } from "node:child_process";

export function teardownCompose(yamlConfig: string, projectDir: string): void {
  const downResult = spawnSync(
    "docker",
    [
      "compose",
      "--project-directory",
      projectDir,
      "-f",
      "-",
      "down",
      "-v",
      "--remove-orphans",
    ],
    {
      cwd: projectDir,
      input: yamlConfig,
      stdio: ["pipe", "inherit", "inherit"],
      encoding: "utf-8",
    },
  );

  if (downResult.error) {
    console.error(
      pc.red(`Failed to run docker compose down: ${downResult.error.message}`),
    );
  }
}
