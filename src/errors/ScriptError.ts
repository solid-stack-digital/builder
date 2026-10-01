export class ScriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
