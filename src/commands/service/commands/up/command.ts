import { handleServiceUp } from "./serviceUp.js";
import type { Command } from "commander";

export const registerUpCommand = (cmd: Command) => {
  const command = cmd
    .command("up [stage]")
    .description(
      "Start or test a service environment (dev, prod, test, test-unit, test-e2e)",
    )
    .option("--skip-check", "Skip infrastructure and contract checks")
    .option("--debug", "Output the merged Docker Compose YAML configuration")
    .option("-d, --detach", "Run containers in the background")
    .option(
      "--dry-run",
      "Preview generated compose configuration without starting containers",
    )
    .option(
      "-C, --project-dir <dir>",
      "Service project directory (defaults to cwd)",
    )
    .option("--unit", "Run only unit tests (when stage is test)")
    .option("--e2e", "Run only e2e tests (when stage is test)")
    .addHelpText(
      "after",
      `\nExamples:
  $ builder service up dev
  $ builder service up prod
  $ builder service up test`,
    )
    .action(
      async (stage: string = "dev", options: Record<string, any> = {}) => {
        const exitCode = await handleServiceUp(stage, {
          projectDir: options.projectDir, 
          debug: options.debug,
          detach: options.detach, 
        });
        if (exitCode !== 0) {
          process.exit(exitCode);
        }
      },
    );
};
