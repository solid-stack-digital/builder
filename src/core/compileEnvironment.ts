import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { ScriptError } from "../errors/ScriptError.js";
import type { Environment } from "../types/index.js";
import { extractBuildDeps } from "../utils/extractBuildDeps.js";
import { extractOverrides } from "../utils/extractOverrides.js";
import { getBuildJson } from "../utils/getBuildJson.js";
import { addDependenciesToAppService } from "../utils/ymlMods/addDependenciesToAppService.js";
import { attachName } from "../utils/ymlMods/attachName.js";
import { makeE2eDependOnApp } from "../utils/ymlMods/makeE2eDependOnApp.js";
import { renameServicesWithDependencies } from "../utils/ymlMods/renameServicesWithDependencies.js";
import { getDockerComposeTemplate } from "./templates.js";

export const compileEnvironment = (
  environment: Environment,
  projectDir: string = process.cwd()
): string => {
  const buildJson = getBuildJson(projectDir);
  const overrides = extractOverrides(buildJson, projectDir);
  const dependencies = extractBuildDeps(buildJson, projectDir);

  const baseComposePath = getDockerComposeTemplate("docker-compose.base.yml");
  const baseComposeDevPath = getDockerComposeTemplate("docker-compose.dev.yml");
  const baseComposeProdPath = getDockerComposeTemplate("docker-compose.prod.yml");
  const baseComposeTestPath = getDockerComposeTemplate("docker-compose.test.yml");
  const baseComposeE2ePath = getDockerComposeTemplate("docker-compose.e2e.yml");
  const baseComposeStandalonePath = getDockerComposeTemplate("docker-compose.standalone.yml");

  const projectName = buildJson.name || path.basename(projectDir);
  const composeFlags: string[] = [
    "compose",
    "-p",
    projectName,
    "--project-directory",
    projectDir,
    "-f",
    baseComposePath,
  ];

  const envFile = path.resolve(projectDir, `.env.${environment}`);
  const hasEnvFile = existsSync(envFile);

  switch (environment) {
    case "dev":
      if (hasEnvFile) {
        composeFlags.push("--env-file", envFile);
      }
      composeFlags.push("-f", baseComposeDevPath);
      if (overrides.dev) {
        composeFlags.push("-f", overrides.dev.path);
      }
      composeFlags.push("-f", baseComposeStandalonePath);
      break;

    case "test":
      if (hasEnvFile) {
        composeFlags.push("--env-file", envFile);
      }
      composeFlags.push("-f", baseComposeTestPath);
      if (overrides.test) {
        composeFlags.push("-f", overrides.test.path);
      }
      break;

    case "prod":
      if (hasEnvFile) {
        composeFlags.push("--env-file", envFile);
      }
      composeFlags.push("-f", baseComposeProdPath);
      if (overrides.prod) {
        composeFlags.push("-f", overrides.prod.path);
      }
      if (dependencies.length > 0) {
        composeFlags.push(...dependencies.flatMap((dep) => ["-f", dep.path]));
      }
      composeFlags.push("-f", baseComposeStandalonePath);
      break;

    case "e2e":
      if (hasEnvFile) {
        composeFlags.push("--env-file", envFile);
      }
      composeFlags.push("-f", baseComposeProdPath);
      if (overrides.prod) {
        composeFlags.push("-f", overrides.prod.path);
      }
      if (dependencies.length > 0) {
        composeFlags.push(...dependencies.flatMap((dep) => ["-f", dep.path]));
      }
      composeFlags.push("-f", baseComposeE2ePath);
      if (overrides.e2e) {
        composeFlags.push("-f", overrides.e2e.path);
      }
      break;
  }

  composeFlags.push("config");

  const result = spawnSync("docker", composeFlags, {
    cwd: projectDir,
    encoding: "utf-8",
  });

  if (result.error) {
    throw new ScriptError(
      `Failed to run docker compose: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new ScriptError(
      `❌ Failed to merge compose files:\n${result.stderr || result.stdout}`
    );
  }

  const mergedYamlConfig = result.stdout;
  const yml = parse(mergedYamlConfig);

  if (environment === "prod" || environment === "e2e") {
    renameServicesWithDependencies(yml, dependencies);
    addDependenciesToAppService(yml, dependencies);
  }

  if (environment === "e2e") {
    makeE2eDependOnApp(yml);
  }

  attachName(yml, buildJson);

  const finalYamlConfig = stringify(yml);
  return finalYamlConfig;
};
