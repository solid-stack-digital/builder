import type { Command } from "commander";
import { handleMeshCheck } from "./handler.js";

export const registerMeshCheckCommand = (cmd: Command) => {
  cmd
    .command("check")
    .description(
      "Validate mesh.json, all services, build.json contracts, and e2e tester contracts"
    )
    .option(
      "-C, --project-dir <dir>",
      "Mesh project directory (defaults to cwd)"
    )
    .option(
      "--require-tester",
      "Fail if an e2e tester is not configured in mesh.json"
    )
    .addHelpText(
      "after",
      `\nExamples:
  $ builder mesh check
  $ builder mesh check -C ./examples/largeProject`
    )
    .action(async (options: Record<string, any> = {}) => {
      const exitCode = await handleMeshCheck({
        projectDir: options.projectDir,
        requireTester: options.requireTester,
      });
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
};
