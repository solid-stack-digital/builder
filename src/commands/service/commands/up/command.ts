import type { Command } from "commander";
import { handleServiceUp } from "./handler.js";

export const registerUpCommand = (cmd: Command): void => {
  cmd
    .command("up [stage]")
    .description(
      "Start or test a service environment (dev, prod, test, test-unit, test-e2e)"
    )
    .option("--debug", "Output the merged Docker Compose YAML configuration")
    .option("-d, --detach", "Run containers in the background")
    .option(
      "--dry-run",
      "Compile configuration and validate checks without starting containers"
    )
    .option(
      "--skip-checks",
      "Skip hadolint and conftest pre-flight checks"
    )
    .option(
      "--silence-warnings",
      "Silence non-critical warnings like URL templating hints"
    )
    .option(
      "-C, --project-dir <dir>",
      "Service project directory (defaults to cwd)"
    )
    .addHelpText(
      "after",
      `\nExamples:
  $ builder service up dev
  $ builder service up prod
  $ builder service up test
  $ builder service up test-unit
  $ builder service up test-e2e`
    )
    .action(
      async (stage: string = "dev", options: Record<string, any> = {}) => {
        const exitCode = await handleServiceUp(stage, {
          projectDir: options.projectDir,
          debug: options.debug,
          detach: options.detach,
          dryRun: options.dryRun,
          skipChecks: options.skipChecks,
          silenceWarnings: options.silenceWarnings,
        });
        if (exitCode !== 0) {
          process.exit(exitCode);
        }
      }
    );
};
