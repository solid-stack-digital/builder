import { ScriptError } from "./ScriptError.js";

/** A command finished with a non-zero status and has already reported why (e.g. Compose output). */
export class CommandExitError extends ScriptError {
  constructor(exitCode: number) {
    super(`exited with code ${exitCode}`, { exitCode });
    this.name = "CommandExitError";
  }
}
