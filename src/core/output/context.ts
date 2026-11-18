import { AsyncLocalStorage } from "node:async_hooks";
import { createOutput } from "./createOutput.js";
import type { Output } from "./types.js";

const scoped = new AsyncLocalStorage<Output>();
let processOutput: Output | undefined;
let fallback: Output | undefined;

/** The Output in effect: a runWithOutput scope, else the CLI's, else normal terminal output. */
export function currentOutput(): Output {
  return scoped.getStore() ?? processOutput ?? (fallback ??= createOutput({ mode: "normal" }));
}

/** CLI only: set the process-wide Output for the running command. */
export function setProcessOutput(output: Output | undefined): void {
  processOutput = output;
}

/** Run `fn` (and everything it awaits) with `output` as the current Output. */
export function runWithOutput<T>(output: Output, fn: () => T): T {
  return scoped.run(output, fn);
}
