import { cac } from "cac";
import pc from "picocolors";
import { checkInfra } from "./commands/checkInfra.js";
import { handleServiceUp } from "./commands/serviceUp.js";
import { ScriptError } from "./errors/ScriptError.js";

export function createCli() {
  const cli = cac("builder");

  cli
    .command("service [action] [stage]", "Manage and run services")
    .option("--skip-check", "Skip infrastructure and contract checks")
    .option("--debug", "Output the merged Docker Compose YAML configuration")
    .option("-d, --detach", "Run containers in the background")
    .option("--dry-run", "Preview generated compose configuration without starting containers")
    .option("-C, --project-dir <dir>", "Service project directory (defaults to cwd)")
    .option("--unit", "Run only unit tests (when stage is test)")
    .option("--e2e", "Run only e2e tests (when stage is test)")
    .example("builder service up dev")
    .example("builder service up prod")
    .example("builder service up test")
    .action(async (action?: string, stage?: string, flags: Record<string, any> = {}) => {
      if (!action || action === "up") {
        const exitCode = await handleServiceUp(stage, {
          projectDir: flags.projectDir || flags.C,
          skipCheck: flags.skipCheck,
          debug: flags.debug,
          detach: flags.detach || flags.d,
          dryRun: flags.dryRun,
          unit: flags.unit,
          e2e: flags.e2e,
        });
        if (exitCode !== 0) {
          process.exit(exitCode);
        }
        return;
      }

      console.error(
        pc.red(`Unknown action: "${action}". Did you mean "builder service up ${stage || "dev"}"?`)
      );
      process.exit(1);
    });

  // Direct shorthand: builder up dev / builder up prod / builder up test
  cli
    .command("up [stage]", "Shorthand for 'builder service up [stage]'")
    .option("--skip-check", "Skip infrastructure and contract checks")
    .option("--debug", "Output the merged Docker Compose YAML configuration")
    .option("-d, --detach", "Run containers in the background")
    .option("--dry-run", "Preview generated compose configuration without starting containers")
    .option("-C, --project-dir <dir>", "Service project directory (defaults to cwd)")
    .option("--unit", "Run only unit tests (when stage is test)")
    .option("--e2e", "Run only e2e tests (when stage is test)")
    .action(async (stage?: string, flags: Record<string, any> = {}) => {
      const exitCode = await handleServiceUp(stage, {
        projectDir: flags.projectDir || flags.C,
        skipCheck: flags.skipCheck,
        debug: flags.debug,
        detach: flags.detach || flags.d,
        dryRun: flags.dryRun,
        unit: flags.unit,
        e2e: flags.e2e,
      });
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });

  // Dedicated infra check command
  cli
    .command("check", "Run infrastructure and contract checks (hadolint, conftest)")
    .option("-C, --project-dir <dir>", "Service project directory (defaults to cwd)")
    .action((flags: Record<string, any> = {}) => {
      const projectDir = flags.projectDir || flags.C || process.cwd();
      checkInfra(projectDir);
    });

  cli.help();
  cli.version("1.0.0");

  return cli;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const cli = createCli();
  try {
    cli.parse(argv, { run: true });
  } catch (err) {
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
