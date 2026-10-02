import type { Command } from "commander";
import { handleMeshDown } from "./handler.js";

export const registerMeshDownCommand = (cmd: Command): void => {
  cmd
    .command("down [stage]")
    .description(
      "Stop and remove containers and networks for the global mesh environment (dev, prod, test, test-e2e)"
    )
    .option(
      "-v, --volumes",
      "Remove named volumes declared in the mesh configuration"
    )
    .option(
      "-C, --project-dir <dir>",
      "Mesh project directory containing mesh.json (defaults to cwd)"
    )
    .option("--debug", "Output the merged Docker Compose YAML configuration")
    .addHelpText(
      "after",
      `\nExamples:
  $ builder mesh down
  $ builder mesh down dev
  $ builder mesh down prod
  $ builder mesh down -v`
    )
    .action(
      async (stage: string = "dev", options: Record<string, any> = {}) => {
        const exitCode = await handleMeshDown(stage, {
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
