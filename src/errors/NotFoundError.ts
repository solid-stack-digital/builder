import { ScriptError, type ScriptErrorOptions } from "./ScriptError.js";

export class NotFoundError extends ScriptError {
  constructor(message: string, options?: ScriptErrorOptions) {
    super(message, options);
    this.name = "NotFoundError";
  }
}

