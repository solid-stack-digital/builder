import { spawnSync } from "node:child_process";
import { ScriptError } from "../errors/ScriptError.js";
import type { Environment } from "../types/index.js";
import { resolveProjectDir } from "../utils/paths.js";
import { compileEnvironment, type CompileEnvironmentOptions } from "./compileEnvironment.js";

/** Resolve the same compiled configuration that service runners send to Compose. */
export function compileApplicationEnv(
  stage: Environment,
  projectDir: string,
  options: CompileEnvironmentOptions = {},
): Record<string, string> {
  const dir = resolveProjectDir(projectDir);
  const yaml = compileEnvironment(stage, dir, options);
  const result = spawnSync("docker", [
    "compose", "--project-directory", dir, "-f", "-", "config", "--format", "json",
  ], { cwd: dir, encoding: "utf-8", input: yaml });
  if (result.error || result.status !== 0) {
    throw new ScriptError(`Failed to resolve ${stage} application environment: ${result.error?.message || result.stderr || result.stdout}`);
  }
  const config = JSON.parse(result.stdout);
  if (!config.services?.app) {
    throw new ScriptError(`The ${stage} configuration has no application service ('app').`);
  }
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.services.app.environment ?? {})) {
    // Unset pass-through entries are removed by Compose. Its config output
    // escapes literal dollars for reuse in YAML; exported values need one dollar.
    if (value !== null && value !== undefined) {
      environment[key] = String(value).replace(/\$\$/g, "$");
    }
  }
  return environment;
}

/** Compose dotenv quoting preserves literal dollars, whitespace and multiline values. */
export function serializeApplicationEnv(environment: Record<string, string>): string {
  return Object.keys(environment).sort().map(key => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new ScriptError(`Cannot export invalid environment variable name: ${key}`);
    }
    const value = environment[key]!;
    if (value.includes("\0")) throw new ScriptError(`Cannot export a NUL character in ${key}.`);
    // Single quotes avoid interpolation. Apostrophes and trailing backslashes
    // need double quotes, with dollar escaping to keep interpolation literal.
    const quoted = /'|\\$|\r/.test(value)
      ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
          .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
          .replace(/\$/g, () => "$$")}"`
      : `'${value}'`;
    return `${key}=${quoted}`;
  }).join("\n") + "\n";
}
