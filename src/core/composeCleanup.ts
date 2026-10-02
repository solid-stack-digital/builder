import type { ChildProcess } from "node:child_process";
import os from "node:os";
import { teardownCompose } from "./teardownCompose.js";

interface ActiveComposeEntry {
  yamlConfig: string;
  projectDir: string;
  removeVolumes?: boolean | undefined;
}

const activeComposeSet = new Set<ActiveComposeEntry>();
let signalHandlersRegistered = false;
let activeChildProcess: ChildProcess | null = null;
let isTearingDown = false;
let isShuttingDown = false;

export function setActiveChild(child: ChildProcess | null): void {
  activeChildProcess = child;
}

export function setTearingDown(tearingDown: boolean): void {
  isTearingDown = tearingDown;
}

export function registerActiveCompose(
  yamlConfig: string,
  projectDir: string,
  options: { removeVolumes?: boolean } = {}
): () => void {
  const entry: ActiveComposeEntry = {
    yamlConfig,
    projectDir,
    removeVolumes: options.removeVolumes,
  };
  activeComposeSet.add(entry);

  ensureSignalHandlers();

  return () => {
    activeComposeSet.delete(entry);
  };
}

function ensureSignalHandlers(): void {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  const handleSignal = (signal: NodeJS.Signals) => {
    // 1. If teardown is actively running, absorb signal so Node does not terminate mid-down
    if (isTearingDown) {
      return;
    }

    // 2. If a child process is actively running, forward the signal to it so it stops gracefully
    if (activeChildProcess && !activeChildProcess.killed) {
      const child = activeChildProcess;
      try {
        child.kill(signal);
      } catch {
        // ignore if already killed
      }

      // If child doesn't exit within 10s after SIGTERM/SIGHUP, force kill
      if (signal !== "SIGINT") {
        setTimeout(() => {
          if (!child.killed) {
            try {
              child.kill("SIGKILL");
            } catch {
              // ignore
            }
          }
        }, 10000).unref();
      }
      return;
    }

    // 3. If no child process is running, perform idempotent cleanup of any active compose entries
    if (isShuttingDown) return;
    isShuttingDown = true;

    for (const item of activeComposeSet) {
      try {
        teardownCompose(item.yamlConfig, item.projectDir, {
          removeVolumes: item.removeVolumes ?? false,
        });
      } catch {
        // ignore cleanup errors during signal shutdown
      }
    }
    activeComposeSet.clear();

    const signalNumber = os.constants.signals[signal] ?? 0;
    process.exit(128 + signalNumber);
  };

  const SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const sig of SIGNALS) {
    process.on(sig, () => handleSignal(sig));
  }
}
