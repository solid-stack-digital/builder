import type { Command } from "commander";
import { handleServiceDown } from "./handler.js";

export const registerDownCommand = (cmd: Command): void => {
  cmd
    .command("down [stage]")
    .description(
      "Stop and remove containers and networks for a service environment (dev, prod, test, test-unit, test-e2e)"
    )
    .option(
      "-v, --volumes",
      "Remove named volumes declared in the volumes section"
    )
    .option(
      "-C, --project-dir <dir>",
      "Service project directory (defaults to cwd)"
    )
    .option("--debug", "Output the merged Docker Compose YAML configuration")
    .addHelpText(
      "after",
      `\nExamples:
  $ builder service down
  $ builder service down dev
  $ builder service down prod
  $ builder service down -v`
    )
    .action(
      async (stage: string = "dev", options: Record<string, any> = {}) => {
        const exitCode = await handleServiceDown(stage, {
          projectDir: options.projectDir,
          volumes: options.volumes,
          debug: options.debug,
        });
        if (exitCode !== 0) {
          process.exit(exitCode);
        }
      }
    );
};
