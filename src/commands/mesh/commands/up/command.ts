import type { Command } from "commander";
import { handleMeshUp } from "./handler.js";

export const registerMeshUpCommand = (cmd: Command) => {
  cmd
    .command("up [stage]")
    .description(
      "Start, build, or test the mesh environment (dev, prod, test, test-unit, test-e2e)"
    )
    .option("--debug", "Output the merged Docker Compose YAML configuration")
    .option("-d, --detach", "Run containers in the background")
    .option("--dry-run", "Compile configuration and validate checks without starting containers")
    .option(
      "-C, --project-dir <dir>",
      "Mesh project directory containing mesh.json (defaults to cwd)"
    )
    .addHelpText(
      "after",
      `\nExamples:
  $ builder mesh up dev
  $ builder mesh up prod
  $ builder mesh up test
  $ builder mesh up test-unit
  $ builder mesh up test-e2e`
    )
    .action(
      async (stage: string = "dev", options: Record<string, any> = {}) => {
        const exitCode = await handleMeshUp(stage, {
          projectDir: options.projectDir,
          debug: options.debug,
          detach: options.detach,
          dryRun: options.dryRun,
        });
        if (exitCode !== 0) {
          process.exit(exitCode);
        }
      }
    );
};
