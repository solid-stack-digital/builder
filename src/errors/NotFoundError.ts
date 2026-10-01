import { ScriptError } from "./ScriptError.js";

export class NotFoundError extends ScriptError {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
