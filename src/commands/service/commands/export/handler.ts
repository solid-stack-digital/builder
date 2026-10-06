import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import pc from "picocolors";
import { compileApplicationEnv, serializeApplicationEnv } from "../../../../core/compileApplicationEnv.js";
import { ScriptError } from "../../../../errors/ScriptError.js";
import type { Environment } from "../../../../types/index.js";
import { resolveProjectDir } from "../../../../utils/paths.js";

const STAGES: Environment[] = ["dev", "prod", "test", "e2e"];

export interface ExportEnvOptions {
  projectDir?: string | undefined;
  full?: boolean | undefined;
  silenceWarnings?: boolean | undefined;
  /** Optional prompt adapter for embedding the command or testing interactions. */
  prompt?: ((question: string) => Promise<string>) | undefined;
}

export async function handleExportEnv(rawStage?: string, options: ExportEnvOptions = {}): Promise<string[]> {
  const stage = rawStage?.toLowerCase();
  if (stage !== undefined && !STAGES.includes(stage as Environment)) {
    throw new ScriptError(`Unknown environment stage: "${rawStage}". Supported stages: ${STAGES.join(", ")}`);
  }
  const projectDir = resolveProjectDir(options.projectDir);
  const stages = stage === undefined ? STAGES : [stage as Environment];
  // Compile every snapshot before writing, so a chosen filename cannot change
  // the inputs used when compiling a later stage.
  const snapshots = stages.map(stage => ({
    stage,
    content: serializeApplicationEnv(compileApplicationEnv(stage, projectDir, options)),
  }));
  let reader: ReturnType<typeof createInterface> | undefined;
  const ask = async (question: string): Promise<string> => {
    if (options.prompt) return options.prompt(question);
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new ScriptError("An existing export needs confirmation. Run this command in an interactive terminal to overwrite it or choose another filename.");
    }
    reader ??= createInterface({ input: process.stdin, output: process.stdout });
    return reader.question(question);
  };
  const files: string[] = [];
  try {
    for (const snapshot of snapshots) {
      let filename = path.join(projectDir, `.env.${snapshot.stage}`);
      while (true) {
        let overwrite = false;
        if (existsSync(filename)) {
          const answer = (await ask(`${filename} already exists. Overwrite? [y/N] `)).trim().toLowerCase();
          overwrite = answer === "y" || answer === "yes";
          if (!overwrite) {
            const name = (await ask(`New filename for ${snapshot.stage} (relative to the service directory): `)).trim();
            if (!name) continue;
            filename = path.resolve(projectDir, name);
            continue;
          }
        }
        mkdirSync(path.dirname(filename), { recursive: true });
        try {
          writeFileSync(filename, snapshot.content, { encoding: "utf-8", flag: overwrite ? "w" : "wx", mode: 0o600 });
        } catch (error) {
          if (!overwrite && (error as NodeJS.ErrnoException).code === "EEXIST") continue;
          throw error;
        }
        files.push(filename);
        console.log(pc.green(`Exported ${snapshot.stage} application environment to ${filename}`));
        break;
      }
    }
  } finally {
    reader?.close();
  }
  return files;
}
