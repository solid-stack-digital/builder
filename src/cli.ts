import { Command } from "commander";
import pc from "picocolors";
import { registerCheckCommand } from "./commands/check/command.js";
import { registerMeshCommand } from "./commands/mesh/command.js";
import { registerPruneCommand } from "./commands/prune/command.js";
import { registerServiceCommand } from "./commands/service/command.js";
import { CommandExitError } from "./errors/CommandExitError.js";
import { ScriptError } from "./errors/ScriptError.js";
import { errorMessage } from "./utils/errorMessage.js";
import { version } from "./version.js";
import {
  createOutput,
  currentOutput,
  formatFailureMessage,
  setProcessOutput,
  type OutputOptions,
} from "./core/output/index.js";

const OUTPUT_FLAG_CONFLICT = "--silent and --logfile cannot be used with";

/** Ancestor command names after the root, the action name, then its positional args. */
function commandLine(action: Command): string {
  const names: string[] = [];
  for (let cmd: Command | null = action; cmd?.parent; cmd = cmd.parent) names.unshift(cmd.name());
  return [...names, ...action.args].join(" ");
}

export function outputOptionsFor(rootOpts: { silent?: boolean; logfile?: string }, action: Command): OutputOptions {
  if (rootOpts.logfile !== undefined) return { mode: "logfile", dir: rootOpts.logfile, command: commandLine(action) };
  if (rootOpts.silent) return { mode: "silent" };
  return { mode: "normal" };
}

/** Reject commands whose purpose is their terminal output (or an interactive prompt). */
export function assertOutputFlagCombination(quiet: boolean, action: Command): void {
  if (!quiet) return;
  if (action.name() === "env" && action.parent?.name() === "export") {
    throw new ScriptError(`${OUTPUT_FLAG_CONFLICT} service export env`, { exitCode: 2 });
  }
  const opts = action.opts();
  if (opts.dryRun && opts.debug) {
    throw new ScriptError(`${OUTPUT_FLAG_CONFLICT} --dry-run --debug`, { exitCode: 2 });
  }
}

export function createCli(): Command {
  const program = new Command();

  program
    .name("builder")
    .description("CLI build tool and orchestrator for Solid Stack services")
    .version(version, "-V, --version", "Output the current version")
    .option("--verbose", "Output verbose error messages with stack traces")
    .option("--silent", "Print only the result (success or failure)")
    .option("--logfile <dir>", "Write all output to a new log file in <dir>; print only the result")
    .exitOverride();

  // Runs before any group hook, so guards fire before dependency checks.
  program.hook("preAction", (root, action) => {
    const rootOpts = root.opts<{ silent?: boolean; logfile?: string }>();
    const options = outputOptionsFor(rootOpts, action);
    assertOutputFlagCombination(options.mode !== "normal", action);
    if (options.mode === "normal") return;
    const output = createOutput(options);
    setProcessOutput(output);
    output.log(pc.dim(`builder v${version}`));
  });

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

function printError(err: unknown, isVerbose: boolean): void {
  const out = currentOutput();
  if (err instanceof ScriptError) {
    const formatted = err.message.startsWith("❌") ? err.message : `❌ ${err.message}`;
    out.error(pc.red(`\n${formatted}\n`));
    if (isVerbose && err.stack) out.error(pc.dim(err.stack));
  } else {
    const message = errorMessage(err);
    const formatted = message.startsWith("❌") ? message : `❌ Error: ${message}`;
    out.error(pc.red(`\n${formatted}\n`));
    if (isVerbose && err instanceof Error && err.stack) out.error(pc.dim(err.stack));
  }
}

function releaseOutput(): void {
  currentOutput().close();
  setProcessOutput(undefined);
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  setProcessOutput(undefined);
  const cli = createCli();

  // Print version banner for all commands except help/version flags.
  // In quiet modes the preAction hook writes it to the output instead.
  const isHelpOrVersion = argv.some(
    (arg) => arg === "-h" || arg === "--help" || arg === "-V" || arg === "--version"
  );
  const isQuiet = argv.some((arg) => arg === "--silent" || arg === "--logfile" || arg.startsWith("--logfile="));
  if (!isHelpOrVersion && !isQuiet && argv.length > 2) {
    currentOutput().log(pc.dim(`builder v${version}`));
  }

  // No arguments provided: print help and exit 0 (M17)
  if (argv.length <= 2) {
    currentOutput().log(pc.dim(`builder v${version}\n`));
    cli.outputHelp();
    return;
  }

  try {
    await cli.parseAsync(argv);
    currentOutput().result({ kind: "success" });
    releaseOutput();
  } catch (err: unknown) {
    const errorObj = err as any;
    if (
      errorObj?.code === "commander.helpDisplayed" ||
      errorObj?.code === "commander.help" ||
      errorObj?.code === "commander.version"
    ) {
      releaseOutput();
      return;
    }

    const isVerbose =
      argv.includes("--verbose") ||
      Boolean(process.env.DEBUG) ||
      Boolean(process.env.VERBOSE);

    const exitCode = errorObj?.exitCode ?? 1;

    // If commander already printed the usage error, do not duplicate (M17)
    if (typeof errorObj?.code === "string" && errorObj.code.startsWith("commander.")) {
      releaseOutput();
      if (process.env.VITEST) {
        throw err;
      }
      process.exit(exitCode);
    }

    const out = currentOutput();
    // A plain non-zero exit was already explained by the command's own output.
    if (!(err instanceof CommandExitError) || out.mode !== "normal") printError(err, isVerbose);
    out.result({ kind: "failure", message: formatFailureMessage(err) });
    releaseOutput();

    if (process.env.VITEST) {
      throw err;
    }
    process.exit(exitCode);
  }
}
