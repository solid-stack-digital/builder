import type { Command } from "commander";
import { handlePrune } from "./handler.js";

export const registerPruneCommand = (cmd: Command): void => {
  cmd
    .command("prune")
    .description("Remove stopped containers, unused networks, and dangling resources")
    .option("-v, --volumes", "Also prune dangling anonymous volumes")
    .action(async (options: Record<string, any> = {}) => {
      const exitCode = await handlePrune({
        volumes: Boolean(options.volumes),
      });
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
};
