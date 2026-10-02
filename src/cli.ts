import { Command } from "commander";
import pc from "picocolors";
import { registerCheckCommand } from "./commands/check/command.js";
import { registerMeshCommand } from "./commands/mesh/command.js";
import { registerPruneCommand } from "./commands/prune/command.js";
import { registerServiceCommand } from "./commands/service/command.js";
import { ScriptError } from "./errors/ScriptError.js";
import { errorMessage } from "./utils/errorMessage.js";
import { version } from "./version.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("builder")
    .description("CLI build tool and orchestrator for Solid Stack services")
    .version(version, "-V, --version", "Output the current version")
    .option("--verbose", "Output verbose error messages with stack traces")
    .exitOverride();

  // Group: builder service up [stage]
  registerServiceCommand(program);

  // Group: builder mesh up [stage]
  registerMeshCommand(program);

  // Dedicated infra check command: builder check
  registerCheckCommand(program);

  // Cleanup command: builder prune
  registerPruneCommand(program);

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const cli = createCli();

  // No arguments provided: print help and exit 0 (M17)
  if (argv.length <= 2) {
    cli.outputHelp();
    return;
  }

  try {
    await cli.parseAsync(argv);
  } catch (err: unknown) {
    const errorObj = err as any;
    if (
      errorObj?.code === "commander.helpDisplayed" ||
      errorObj?.code === "commander.help" ||
      errorObj?.code === "commander.version"
    ) {
      return;
    }

    const isVerbose =
      argv.includes("--verbose") ||
      Boolean(process.env.DEBUG) ||
      Boolean(process.env.VERBOSE);

    let exitCode = errorObj?.exitCode ?? 1;

    // If commander already printed the usage error, do not duplicate (M17)
    if (typeof errorObj?.code === "string" && errorObj.code.startsWith("commander.")) {
      if (process.env.VITEST) {
        throw err;
      }
      process.exit(exitCode);
    }

    if (err instanceof ScriptError) {
      exitCode = err.exitCode;
      const formatted = err.message.startsWith("❌")
        ? err.message
        : `❌ ${err.message}`;
      console.error(pc.red(`\n${formatted}\n`));
      if (isVerbose && err.stack) {
        console.error(pc.dim(err.stack));
      }
    } else {
      const message = errorMessage(err);
      const formatted = message.startsWith("❌")
        ? message
        : `❌ Error: ${message}`;
      console.error(pc.red(`\n${formatted}\n`));
      if (isVerbose && err instanceof Error && err.stack) {
        console.error(pc.dim(err.stack));
      }
    }

    if (process.env.VITEST) {
      throw err;
    }
    process.exit(exitCode);
  }
}

