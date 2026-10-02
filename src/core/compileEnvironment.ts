import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { ScriptError } from "../errors/ScriptError.js";
import type { Environment } from "../types/index.js";
import { extractBuildDeps } from "../utils/extractBuildDeps.js";
import { extractOverrides } from "../utils/extractOverrides.js";
import { getBuildJson } from "../utils/getBuildJson.js";
import { resolveProjectDir } from "../utils/paths.js";
import { deriveProjectName } from "../utils/projectName.js";
import { addDependenciesToAppService } from "../utils/ymlMods/addDependenciesToAppService.js";
import { attachName } from "../utils/ymlMods/attachName.js";
import { makeE2eDependOnApp } from "../utils/ymlMods/makeE2eDependOnApp.js";
import { renameServicesWithDependencies } from "../utils/ymlMods/renameServicesWithDependencies.js";
import { explainComposeMergeFailure } from "./checkers/explainComposeMergeFailure.js";
import { getDockerComposeTemplate } from "./templates.js";

export const compileEnvironment = (
  environment: Environment,
  projectDir: string = process.cwd()
): string => {
  const absProjectDir = resolveProjectDir(projectDir);
  const buildJson = getBuildJson(absProjectDir);
  const overrides = extractOverrides(buildJson, absProjectDir);
  const dependencies = extractBuildDeps(buildJson, absProjectDir);

  const rawProjectName = buildJson.name || path.basename(absProjectDir);
  const projectName = deriveProjectName(rawProjectName, environment);

  const baseComposePath = getDockerComposeTemplate("docker-compose.base.yml");

  const composeFlags: string[] = [
    "compose",
    "-p",
    projectName,
    "--project-directory",
    absProjectDir,
    "-f",
    baseComposePath,
  ];

  const filesUsed: string[] = [baseComposePath];

  // Include .env if present
  const defaultEnv = path.resolve(absProjectDir, ".env");
  if (existsSync(defaultEnv)) {
    composeFlags.push("--env-file", defaultEnv);
  }

  // M1: E2E env precedence: .env -> .env.prod -> .env.e2e (later flags take precedence)
  if (environment === "e2e") {
    const prodEnv = path.resolve(absProjectDir, ".env.prod");
    if (existsSync(prodEnv)) {
      composeFlags.push("--env-file", prodEnv);
    }
    const e2eEnv = path.resolve(absProjectDir, ".env.e2e");
    if (existsSync(e2eEnv)) {
      composeFlags.push("--env-file", e2eEnv);
    }
  } else {
    const stageEnv = path.resolve(absProjectDir, `.env.${environment}`);
    if (existsSync(stageEnv)) {
      composeFlags.push("--env-file", stageEnv);
    }
  }

  switch (environment) {
    case "dev": {
      const devPath = getDockerComposeTemplate("docker-compose.dev.yml");
      const standalonePath = getDockerComposeTemplate("docker-compose.standalone.yml");

      composeFlags.push("-f", devPath);
      filesUsed.push(devPath);

      if (overrides.dev) {
        composeFlags.push("-f", overrides.dev.path);
        filesUsed.push(overrides.dev.path);
      }

      composeFlags.push("-f", standalonePath);
      filesUsed.push(standalonePath);
      break;
    }

    case "test": {
      const testPath = getDockerComposeTemplate("docker-compose.test.yml");
      composeFlags.push("-f", testPath);
      filesUsed.push(testPath);

      if (overrides.test) {
        composeFlags.push("-f", overrides.test.path);
        filesUsed.push(overrides.test.path);
      }
      break;
    }

    case "prod": {
      const prodPath = getDockerComposeTemplate("docker-compose.prod.yml");
      const standalonePath = getDockerComposeTemplate("docker-compose.standalone.yml");

      composeFlags.push("-f", prodPath);
      filesUsed.push(prodPath);

      if (overrides.prod) {
        composeFlags.push("-f", overrides.prod.path);
        filesUsed.push(overrides.prod.path);
      }

      if (dependencies.length > 0) {
        for (const dep of dependencies) {
          composeFlags.push("-f", dep.path);
          filesUsed.push(dep.path);
        }
      }

      composeFlags.push("-f", standalonePath);
      filesUsed.push(standalonePath);
      break;
    }

    case "e2e": {
      const prodPath = getDockerComposeTemplate("docker-compose.prod.yml");
      const e2ePath = getDockerComposeTemplate("docker-compose.e2e.yml");

      composeFlags.push("-f", prodPath);
      filesUsed.push(prodPath);

      if (overrides.prod) {
        composeFlags.push("-f", overrides.prod.path);
        filesUsed.push(overrides.prod.path);
      }

      if (dependencies.length > 0) {
        for (const dep of dependencies) {
          composeFlags.push("-f", dep.path);
          filesUsed.push(dep.path);
        }
      }

      composeFlags.push("-f", e2ePath);
      filesUsed.push(e2ePath);

      if (overrides.e2e) {
        composeFlags.push("-f", overrides.e2e.path);
        filesUsed.push(overrides.e2e.path);
      }
      break;
    }
  }

  composeFlags.push("config");

  const result = spawnSync("docker", composeFlags, {
    cwd: absProjectDir,
    encoding: "utf-8",
  });

  if (result.error) {
    throw new ScriptError(
      `Failed to run docker compose: ${result.error.message}`,
      { cause: result.error }
    );
  }

  if (result.status !== 0) {
    const rawOutput = result.stderr || result.stdout;
    const explanation = explainComposeMergeFailure(
      buildJson,
      absProjectDir,
      environment,
      filesUsed,
      rawOutput
    );
    throw new ScriptError(`❌ Failed to merge compose files:\n${explanation}`);
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

  attachName(yml, projectName);

  const finalYamlConfig = stringify(yml);
  return finalYamlConfig;
};
