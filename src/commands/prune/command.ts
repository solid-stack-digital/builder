import type { Command } from "commander";
import { handlePrune } from "./handler.js";

export const registerPruneCommand = (cmd: Command): void => {
  cmd
    .command("prune")
    .description("Remove stopped Builder-owned containers, networks, and dangling resources")
    .option("-v, --volumes", "Also prune dangling anonymous volumes")
    .option("--dry-run", "Print scoped prune commands without running Docker")
    .action(async (options: Record<string, any> = {}) => {
      const exitCode = await handlePrune({
        volumes: Boolean(options.volumes),
        dryRun: Boolean(options.dryRun),
      });
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
};
