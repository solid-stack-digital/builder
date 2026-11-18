import fs from "node:fs";
import { format, stripVTControlCharacters } from "node:util";
import { openLogFile } from "./logFile.js";
import type { ChildStdio, Output, OutputOptions, OutputSinks, PipeableChild, ResultLine } from "./types.js";

const RUNNING = "running (press Ctrl-C to stop)";

function normalOutput(): Output {
  return {
    mode: "normal",
    logPath: undefined,
    log: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    write: (stream, chunk) => { (stream === "stdout" ? process.stdout : process.stderr).write(chunk); },
    childStdio: (): ChildStdio => ["inherit", "inherit"],
    pipeChild: () => {},
    result: () => {},
    close: () => {},
  };
}

function quietOutput(sinks: OutputSinks, file?: { fd: number; path: string }): Output {
  const stdout = sinks.stdout ?? process.stdout, stderr = sinks.stderr ?? process.stderr;
  let fd = file?.fd;
  const toFile = (text: string) => {
    if (fd === undefined) return;
    try { fs.writeSync(fd, stripVTControlCharacters(text)); } catch { /* the log must never crash the run */ }
  };
  const line = (...args: unknown[]) => toFile(`${format(...args)}\n`);
  return {
    mode: file ? "logfile" : "silent",
    logPath: file?.path,
    log: line,
    warn: line,
    error: line,
    write: (_stream, chunk) => toFile(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")),
    childStdio: (): ChildStdio => (file ? ["pipe", "pipe"] : ["ignore", "ignore"]),
    pipeChild: (child: PipeableChild) => {
      if (!file) return;
      child.stdout?.on("data", (chunk: string | Buffer) => toFile(String(chunk)));
      child.stderr?.on("data", (chunk: string | Buffer) => toFile(String(chunk)));
    },
    result: (result: ResultLine) => {
      if (fd === undefined && file) return;
      const [stream, text] = result.kind === "success" ? [stdout, "success"]
        : result.kind === "running" ? [stdout, RUNNING]
        : [stderr, file ? `failure (see ${file.path})` : `failure: ${result.message}`];
      toFile(`${text}\n`);
      stream.write(`${text}\n`);
    },
    close: () => {
      if (fd === undefined) return;
      const open = fd;
      fd = undefined;
      try { fs.closeSync(open); } catch { /* already closed */ }
    },
  };
}

/** Build the Output for a mode. Only logfile mode touches the filesystem. */
export function createOutput(options: OutputOptions, sinks: OutputSinks = {}): Output {
  if (options.mode === "normal") return normalOutput();
  if (options.mode === "silent") return quietOutput(sinks);
  return quietOutput(sinks, openLogFile(options.dir, options.command, sinks));
}
