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

export const isProcessAlive = (c: ChildProcess | null): boolean => {
  return Boolean(c && c.exitCode === null && c.signalCode === null);
};

export function setActiveChild(child: ChildProcess | null): void {
  activeChildProcess = child;
  if (!child) {
    isShuttingDown = false;
  }
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
    // 1. If teardown is actively running, absorb signal so Node and down do not terminate mid-down
    if (isTearingDown) {
      return;
    }

    // 2. If an active child process is running:
    if (activeChildProcess && isProcessAlive(activeChildProcess)) {
      const child = activeChildProcess;

      if (signal === "SIGINT") {
        if (!isShuttingDown) {
          // First Ctrl+C: Terminal OS process group already sent SIGINT to Compose directly.
          // Do NOT double-deliver; allow Compose to begin graceful shutdown.
          isShuttingDown = true;

          // Escalate to SIGKILL after 10s if child remains alive
          setTimeout(() => {
            if (isProcessAlive(child)) {
              try {
                child.kill("SIGKILL");
              } catch {
                // ignore
              }
            }
          }, 10_000).unref();
          return;
        }

        // Second Ctrl+C: User specifically pressed Ctrl+C again to force abort.
        try {
          child.kill("SIGINT");
        } catch {
          // ignore
        }
        return;
      }

      // SIGTERM or SIGHUP: Sent to Node PID alone (e.g. CI cancel, kill).
      // Compose does not receive this from terminal, so Node must forward it.
      try {
        child.kill(signal);
      } catch {
        // ignore
      }

      // Escalate to SIGKILL after 10s if child remains alive
      setTimeout(() => {
        if (isProcessAlive(child)) {
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
        }
      }, 10_000).unref();
      return;
    }

    // 3. If no child process is running, perform idempotent cleanup of any active compose entries
    if (isShuttingDown) return;
    isShuttingDown = true;

    for (const item of activeComposeSet) {
      try {
        teardownCompose(item.yamlConfig, item.projectDir, {
          removeVolumes: item.removeVolumes ?? false,
        }).catch(() => {});
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
    const listener = () => handleSignal(sig);
    registeredListeners.push([sig, listener]);
    process.on(sig, listener);
  }
}

const registeredListeners: Array<[NodeJS.Signals, (...args: any[]) => void]> = [];

export function resetSignalHandlersForTests(): void {
  signalHandlersRegistered = false;
  activeChildProcess = null;
  isTearingDown = false;
  isShuttingDown = false;
  activeComposeSet.clear();
  for (const [sig, listener] of registeredListeners) {
    process.removeListener(sig, listener);
  }
  registeredListeners.length = 0;
}

