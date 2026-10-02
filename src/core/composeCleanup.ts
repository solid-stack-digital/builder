import os from "node:os";
import { teardownCompose } from "./teardownCompose.js";

interface ActiveComposeEntry {
  yamlConfig: string;
  projectDir: string;
}

const activeComposeSet = new Set<ActiveComposeEntry>();
let signalHandlersRegistered = false;
let isShuttingDown = false;

export function registerActiveCompose(
  yamlConfig: string,
  projectDir: string
): () => void {
  const entry: ActiveComposeEntry = { yamlConfig, projectDir };
  activeComposeSet.add(entry);

  if (!signalHandlersRegistered) {
    signalHandlersRegistered = true;

    const cleanupAndExit = (signal: NodeJS.Signals) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      for (const item of activeComposeSet) {
        try {
          teardownCompose(item.yamlConfig, item.projectDir);
        } catch {
          // ignore cleanup errors during signal shutdown
        }
      }

      const signalNumber = os.constants.signals[signal] ?? 0;
      process.exit(128 + signalNumber);
    };

    process.once("SIGINT", () => cleanupAndExit("SIGINT"));
    process.once("SIGTERM", () => cleanupAndExit("SIGTERM"));
  }

  return () => {
    activeComposeSet.delete(entry);
  };
}
