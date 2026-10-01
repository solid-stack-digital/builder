import type { Command } from "commander";
import { handleCheck } from "./handler.js";

export const registerCheckCommand = (cmd: Command) => {
  cmd
    .command("check")
    .description("Run infrastructure and contract checks (hadolint, conftest)")
    .option(
      "-C, --project-dir <dir>",
      "Service project directory (defaults to cwd)",
    )
    .addHelpText(
      "after",
      `\nExamples:
  $ builder check
  $ builder check -C ./services/backend`,
    )
    .action(async (options: Record<string, any> = {}) => {
      const exitCode = await handleCheck({
        projectDir: options.projectDir,
      });
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
};
