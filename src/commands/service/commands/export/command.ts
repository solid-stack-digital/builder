import { Argument, type Command } from "commander";
import { handleExportEnv } from "./handler.js";

export function registerExportCommand(service: Command): void {
  const command = service.command("export").description("Export service configuration");
  command.command("env")
    .description("Export the application's resolved environment for one or all stages")
    .addArgument(new Argument("[stage]", "Stage to export (defaults to all four)").choices(["dev", "prod", "test", "e2e"]))
    .option("-C, --project-dir <dir>", "Service project directory (defaults to cwd)")
    .option("--full", "Export dev with mock dependencies and integrated infra mode")
    .option("--integrated", "Alias for --full")
    .option("--silence-warnings", "Silence non-critical URL templating warnings")
    .addHelpText("after", `\nExamples:
  $ builder service export env
  $ builder service export env dev
  $ builder service export env e2e -C ./services/backend
  $ builder service export env dev --full`)
    .action(async (stage: string | undefined, options) => {
      await handleExportEnv(stage, {
        projectDir: options.projectDir,
        full: Boolean(options.full || options.integrated),
        silenceWarnings: options.silenceWarnings,
      });
    });
}
