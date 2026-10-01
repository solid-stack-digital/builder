import { handleServiceUp } from "./handler.js";
import type { Command } from "commander";

export const registerUpCommand = (cmd: Command) => {
  const command = cmd
    .command("up [stage]")
    .description(
      "Start or test a service environment (dev, prod, test, test-unit, test-e2e)",
    )
    .option("--debug", "Output the merged Docker Compose YAML configuration")
    .option("-d, --detach", "Run containers in the background")

    .option(
      "-C, --project-dir <dir>",
      "Service project directory (defaults to cwd)",
    )

    .addHelpText(
      "after",
      `\nExamples:
  $ builder service up dev
  $ builder service up prod
  $ builder service up test
  $ builder service up test-unit
  $ builder service up test-e2e`,
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
