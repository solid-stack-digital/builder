import { ScriptError, type ScriptErrorOptions } from "./ScriptError.js";
export interface ConfigErrorContext { sourceFile?: string; configPath?: string; value?: unknown; referencedObject?: string; stage?: string; composition?: "service" | "mesh"; reason: string; }
export class ConfigError extends ScriptError {
  readonly context: ConfigErrorContext;
  constructor(context: ConfigErrorContext, options?: ScriptErrorOptions) {
    const details = [context.sourceFile ? `source=${context.sourceFile}` : undefined, context.configPath ? `path=${context.configPath}` : undefined, context.stage ? `stage=${context.stage}` : undefined, context.composition ? `composition=${context.composition}` : undefined, context.referencedObject ? `reference=${context.referencedObject}` : undefined, context.value !== undefined ? `value=${JSON.stringify(context.value)}` : undefined].filter(Boolean);
    super(`${context.reason}${details.length ? ` (${details.join(", ")})` : ""}`, options);
    this.name = "ConfigError";
    this.context = context;
  }
}
