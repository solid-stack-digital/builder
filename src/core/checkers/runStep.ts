import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import pc from "picocolors";
import { ScriptError } from "../../errors/ScriptError.js";
import { currentOutput } from "../output/index.js";

export interface StepContext {
  stepName: string;
  targetFile?: string;
  detail?: string;
  input?: string | Buffer;
}

export function runStep(
  executable: string,
  args: string[],
  projectDir: string,
  ctx: StepContext
): void {
  const options: SpawnSyncOptions = {
    cwd: projectDir,
    stdio: [ctx.input !== undefined ? "pipe" : "inherit", "pipe", "pipe"],
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
    input: ctx.input,
  };

  const result = spawnSync(executable, args, options);

  const stdout = (result.stdout as string) ?? "";
  const stderr = (result.stderr as string) ?? "";
  const out = currentOutput();
  if (stdout) out.write("stdout", stdout);
  if (stderr) out.write("stderr", stderr);

  if (result.error || result.status !== 0) {
    out.error("\n" + "=".repeat(60));
    out.error(pc.red(`🚨 INFRASTRUCTURE CHECK FAILED 🚨`));
    out.error("=".repeat(60));
    out.error(`Failed Step : ${ctx.stepName}`);
    if (ctx.targetFile) {
      out.error(`Target File : ${ctx.targetFile}  <-- FIX THIS FILE`);
    }
    if (result.error) {
      out.error(`Cause       : ${result.error.message}`);
    }
    if (ctx.detail) {
      out.error(`\n${ctx.detail}`);
    }
    out.error("=".repeat(60) + "\n");

    const causeMsg = result.error ? ` (${result.error.message})` : "";
    throw new ScriptError(
      `Infrastructure check failed at step: ${ctx.stepName}${causeMsg}`,
      { cause: result.error, exitCode: result.status ?? 1 }
    );
  }
}
