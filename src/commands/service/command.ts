import type { Command } from "commander";
import { handleServiceUp } from "../serviceUp.js";

const handleUpAction = async (
  stage: string = "dev",
  options: Record<string, any> = {},
) => {
  const exitCode = await handleServiceUp(stage, {
    projectDir: options.projectDir,
    skipCheck: options.skipCheck,
    debug: options.debug,
    detach: options.detach,
    dryRun: options.dryRun,
    unit: options.unit,
    e2e: options.e2e,
  });
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
};
const registerUpOptions = (cmd: Command) => {
  return cmd
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
    .option("--e2e", "Run only e2e tests (when stage is test)");
};

export const registerServiceCommand = (program: Command) => {
  const service = program
    .command("service")
    .description("Manage and run services");

  registerUpOptions(
    service
      .command("up [stage]")
      .description(
        "Start or test a service environment (dev, prod, test, test-unit, test-e2e)",
      ),
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
    .action(handleUpAction);
};
