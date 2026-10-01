import { Command } from "commander";
import pc from "picocolors";
import { checkInfra } from "./commands/checkInfra.js";
import { handleServiceUp } from "./commands/serviceUp.js";
import { ScriptError } from "./errors/ScriptError.js";
import { version } from "./version.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("builder")
    .description("CLI build tool and orchestrator for Solid Stack services")
    .version(version, "-v, --version", "Output the current version");

  const registerUpOptions = (cmd: Command) => {
    return cmd
      .option("--skip-check", "Skip infrastructure and contract checks")
      .option("--debug", "Output the merged Docker Compose YAML configuration")
      .option("-d, --detach", "Run containers in the background")
      .option("--dry-run", "Preview generated compose configuration without starting containers")
      .option("-C, --project-dir <dir>", "Service project directory (defaults to cwd)")
      .option("--unit", "Run only unit tests (when stage is test)")
      .option("--e2e", "Run only e2e tests (when stage is test)");
  };

  const handleUpAction = async (stage: string = "dev", options: Record<string, any> = {}) => {
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

  // Group: builder service up [stage]
  const service = program
    .command("service")
    .description("Manage and run services");

  registerUpOptions(
    service
      .command("up [stage]")
      .description("Start or test a service environment (dev, prod, test, test-unit, test-e2e)")
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
    .action(handleUpAction);

  // Direct shorthand: builder up [stage]
  registerUpOptions(
    program
      .command("up [stage]")
      .description("Shorthand for 'builder service up [stage]'")
  )
    .addHelpText(
      "after",
      `\nExamples:
  $ builder up dev
  $ builder up prod
  $ builder up test`
    )
    .action(handleUpAction);

  // Dedicated infra check command: builder check
  program
    .command("check")
    .description("Run infrastructure and contract checks (hadolint, conftest)")
    .option("-C, --project-dir <dir>", "Service project directory (defaults to cwd)")
    .action((options: Record<string, any> = {}) => {
      const projectDir = options.projectDir || process.cwd();
      checkInfra(projectDir);
    });

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const cli = createCli();
  try {
    await cli.parseAsync(argv);
  } catch (err: any) {
    if (err?.code === "commander.helpDisplayed" || err?.code === "commander.version") {
      return;
    }
    if (err instanceof ScriptError) {
      console.error(pc.red(`\n❌ ${err.message}\n`));
    } else {
      const message = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`\n❌ Error: ${message}\n`));
    }
    if (process.env.VITEST) {
      throw err;
    }
    process.exit(1);
  }
}
