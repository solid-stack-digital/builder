import { Command } from "commander";
import pc from "picocolors";
import { ScriptError } from "./errors/ScriptError.js";
import { version } from "./version.js";
import { registerServiceCommand } from "./commands/service/command.js";
import { registerCheckCommand } from "./commands/check/command.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("builder")
    .description("CLI build tool and orchestrator for Solid Stack services")
    .version(version, "-v, --version", "Output the current version");

  // Group: builder service up [stage]
  registerServiceCommand(program);

  // Dedicated infra check command: builder check
  registerCheckCommand(program);

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const cli = createCli();
  try {
    await cli.parseAsync(argv);
  } catch (err: any) {
    if (
      err?.code === "commander.helpDisplayed" ||
      err?.code === "commander.version"
    ) {
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
