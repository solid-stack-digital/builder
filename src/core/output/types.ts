export type OutputMode = "normal" | "silent" | "logfile";
export type ChildStdio = ["inherit", "inherit"] | ["ignore", "ignore"] | ["pipe", "pipe"];
export type ResultLine = { kind: "success" } | { kind: "running" } | { kind: "failure"; message: string };
export type OutputOptions = { mode: "normal" } | { mode: "silent" } | { mode: "logfile"; dir: string; command: string };
export interface OutputSinks {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  now?: () => number;
  pid?: number;
  cwd?: string;
}
export interface PipeableChild {
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
}
/** Every Builder write goes through an Output; the mode decides where it lands. */
export interface Output {
  readonly mode: OutputMode;
  /** Absolute log file path (logfile mode only). */
  readonly logPath: string | undefined;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** Raw captured or child output. */
  write(stream: "stdout" | "stderr", chunk: string | Uint8Array): void;
  /** stdout/stderr entries for child_process stdio. */
  childStdio(): ChildStdio;
  /** Stream a piped child's output into this Output (no-op unless logfile). */
  pipeChild(child: PipeableChild): void;
  /** Print the final result line (no-op in normal mode). */
  result(line: ResultLine): void;
  /** Idempotent; later writes are ignored. */
  close(): void;
}
