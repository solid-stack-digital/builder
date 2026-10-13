import type { Command } from "commander";
import { handleMeshUp } from "./handler.js";

export const registerMeshUpCommand = (cmd: Command): void => {
  cmd
    .command("up [stage]")
    .description(
      "Start, build, or test the mesh environment (dev, prod, test, test-e2e)"
    )
    .option("--debug", "Output the merged Docker Compose YAML configuration")
    .option("-d, --detach", "Run containers in the background")
    .option(
      "--dry-run",
      "Compile configuration and validate checks without starting containers"
    )
    .option(
      "--skip-checks",
      "Skip hadolint and conftest pre-flight checks"
    )
    .option(
      "--silence-warnings",
      "Silence non-critical warnings like URL templating hints"
    )
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
  $ builder mesh up test-e2e

Mesh JSON overlays: dev, prod, e2e. test-e2e uses base -> prod -> e2e.
The test command runs each root service test lifecycle (unit, then service E2E) before global E2E.
For a service’s isolated tests: builder service up test-unit -C <service>.`
    )
    .action(
      async (stage: string = "dev", options: Record<string, any> = {}) => {
        const exitCode = await handleMeshUp(stage, {
          projectDir: options.projectDir,
          debug: options.debug,
          detach: options.detach,
          dryRun: options.dryRun,
          skipChecks: options.skipChecks,
        });
        if (exitCode !== 0) {
          process.exit(exitCode);
        }
      }
    );
};
