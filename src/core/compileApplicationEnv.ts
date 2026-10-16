import { spawnSync } from "node:child_process";
import { stringify } from "yaml";
import { ScriptError } from "../errors/ScriptError.js";
import type { Environment } from "../types/index.js";
import { resolveProjectDir } from "../utils/paths.js";
import type { CompileEnvironmentOptions } from "./compileEnvironment.js";
import { compileServiceComposition } from "./composition/compileServiceComposition.js";
import { nodeId } from "./config/types.js";

export type ResolveComposeConfig = (yaml:string,projectDir:string)=>{services:Record<string,{environment?:Record<string,string|null>}>};
function resolveComposeConfig(yaml:string,dir:string):ReturnType<ResolveComposeConfig> {
  const result=spawnSync("docker", ["compose", "--project-directory", dir, "-f", "-", "config", "--format", "json"], { cwd: dir, encoding: "utf-8", input: yaml });
  if(result.error||result.status!==0)throw new ScriptError(`Failed to resolve application environment: ${result.error?.message||result.stderr||result.stdout}`);
  return JSON.parse(result.stdout) as ReturnType<ResolveComposeConfig>;
}

/** Resolve the same compiled configuration that service runners send to Compose. */
export function compileApplicationEnv(
  stage: Environment,
  projectDir: string,
  options: CompileEnvironmentOptions = {},
  resolver: ResolveComposeConfig = resolveComposeConfig,
): Record<string, string> {
  const dir = resolveProjectDir(projectDir);
  const compiled=compileServiceComposition(stage,dir,{validationMode:true,...options});
  const main=compiled.mainServiceNames.get(nodeId(undefined,"main"));
  const yaml = stringify(compiled.compose);
  const config = resolver(yaml,dir);
  if (!main || !config.services?.[main]) {
    throw new ScriptError(`The ${stage} configuration has no main service.`);
  }
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.services[main].environment ?? {})) {
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
