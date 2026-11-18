import fs from "node:fs";
import path from "node:path";
import { ScriptError } from "../../errors/ScriptError.js";
import { errorMessage } from "../../utils/errorMessage.js";
import type { OutputSinks } from "./types.js";

/** `<epoch-ms>-<pid>-<command>.log`, command slugged to `[a-z0-9-]`. */
export function logFileName(command: string, now: number, pid: number): string {
  const slug = command.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${now}-${pid}-${slug || "builder"}.log`;
}

/** Create the directory if needed and open a new private log file in it. */
export function openLogFile(dir: string, command: string, sinks: OutputSinks = {}): { fd: number; path: string } {
  const abs = path.resolve(sinks.cwd ?? process.cwd(), dir);
  const notDirectory = () => new ScriptError(`--logfile path is not a directory: ${abs}`, { exitCode: 2 });
  if (fs.existsSync(abs) && !fs.statSync(abs).isDirectory()) throw notDirectory();
  try {
    fs.mkdirSync(abs, { recursive: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "ENOTDIR") throw notDirectory();
    throw new ScriptError(`Cannot create --logfile directory ${abs}: ${errorMessage(error)}`, { cause: error, exitCode: 2 });
  }
  const file = path.join(abs, logFileName(command, sinks.now?.() ?? Date.now(), sinks.pid ?? process.pid));
  try {
    return { fd: fs.openSync(file, "wx", 0o600), path: file };
  } catch (error) {
    throw new ScriptError(`Cannot create log file ${file}: ${errorMessage(error)}`, { cause: error, exitCode: 2 });
  }
}

/** One-line failure reason: strip a leading "❌ " and collapse newlines. */
export function formatFailureMessage(error: unknown): string {
  return errorMessage(error).replace(/^❌\s*/, "").replace(/\s*\n\s*/g, " ").trim();
}
