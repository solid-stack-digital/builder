import { spawnSync } from "node:child_process";
import pc from "picocolors";
import { ScriptError } from "../../errors/ScriptError.js";

export interface StepContext {
  stepName: string;
  targetFile?: string;
  detail?: string;
}

export function runStep(
  command: string,
  projectDir: string,
  ctx: StepContext,
): void {
  const result = spawnSync(command, {
    shell: true,
    cwd: projectDir,
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf-8",
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (result.status !== 0) {
    console.error("\n" + "=".repeat(60));
    console.error(pc.red(`🚨 INFRASTRUCTURE CHECK FAILED 🚨`));
    console.error("=".repeat(60));
    console.error(`Failed Step : ${ctx.stepName}`);
    if (ctx.targetFile) {
      console.error(`Target File : ${ctx.targetFile}  <-- FIX THIS FILE`);
    }
    if (ctx.detail) {
      console.error(`\n${ctx.detail}`);
    }
    console.error("=".repeat(60) + "\n");

    throw new ScriptError(`Infrastructure check failed at step: ${ctx.stepName}`);
  }
}
