export interface ScriptErrorOptions {
  cause?: unknown;
  exitCode?: number;
}

export class ScriptError extends Error {
  readonly exitCode: number;

  constructor(message: string, options?: ScriptErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ScriptError";
    this.exitCode = options?.exitCode ?? 1;
  }
}

