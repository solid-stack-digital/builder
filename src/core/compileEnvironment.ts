import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
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

export interface CompileEnvironmentOptions {
  silenceWarnings?: boolean | undefined;
  full?: boolean | undefined;
}

export const compileEnvironment = (
  environment: Environment,
  projectDir: string = process.cwd(),
  options: CompileEnvironmentOptions = {}
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

      if (options.full && dependencies.length > 0) {
        for (const dep of dependencies) {
          composeFlags.push("-f", dep.path);
          filesUsed.push(dep.path);
        }
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

  const envVars = { ...process.env };

  if (buildJson.port) {
    envVars.PUBLIC_PORT = String(buildJson.port);
  }
  // Enforce internal port 3000 standard on standalone too
  envVars.PORT = "3000";

  const result = spawnSync("docker", composeFlags, {
    cwd: absProjectDir,
    encoding: "utf-8",
    env: envVars,
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

  if (
    environment === "prod" ||
    environment === "e2e" ||
    (environment === "dev" && options.full)
  ) {
    renameServicesWithDependencies(yml, dependencies);
    addDependenciesToAppService(yml, dependencies);
  }

  if (environment === "e2e") {
    makeE2eDependOnApp(yml);
  }

  // --- URL TEMPLATING REGISTRY ---
  const INTERNAL_PORT = 3000;
  const urlRegistry = new Map<string, { networkUrl: string; publicUrl: string | null }>();

  // 1. Register App
  const appPublicPort = buildJson.port ? Number(buildJson.port) : null;
  urlRegistry.set("app", {
    networkUrl: `http://app:${INTERNAL_PORT}`,
    publicUrl: appPublicPort ? `http://localhost:${appPublicPort}` : null,
  });
  if (buildJson.name && buildJson.name !== "app") {
    urlRegistry.set(buildJson.name, urlRegistry.get("app")!);
  }

  // 2. Register Dependencies
  for (const dep of dependencies) {
    const depPortStr = dep.port ? String(dep.port) : null;
    const depHostPort = depPortStr
      ? depPortStr.includes(":")
        ? depPortStr.split(":")[0]
        : depPortStr
      : null;
    urlRegistry.set(dep.name, {
      networkUrl: `http://${dep.name}:${INTERNAL_PORT}`,
      publicUrl: depHostPort ? `http://localhost:${depHostPort}` : null,
    });
  }

  // 3. Interpolation Helper
  const interpolateEnv = (val: string, context: string): string => {
    // 🚨 SMART WARNING: E2E Network Mode Host Context
    if (!options.silenceWarnings && context.includes("Tester") && val.includes(".network_url")) {
      console.warn(
        pc.yellow(`\n⚠️  WARNING: You are passing a '.network_url' template to the E2E tester ("${val}"). Since the tester runs in 'network_mode: host', it cannot resolve internal Docker DNS. Use '.public_url' instead. (Mute with --silence-warnings)\n`)
      );
    }

    let output = val;
    for (const [sName, urls] of urlRegistry.entries()) {
      const escaped = sName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      output = output.replace(
        new RegExp(`\\$\\{${escaped}\\.network_url\\}`, "g"),
        urls.networkUrl
      );
      if (urls.publicUrl) {
        output = output.replace(
          new RegExp(`\\$\\{${escaped}\\.public_url\\}`, "g"),
          urls.publicUrl
        );
      }
    }

    // Strict validation for unresolved variables and missing public ports
    const unresolvedMatch = output.match(/\$\{([^}]+?)\.(network_url|public_url)\}/);
    if (unresolvedMatch) {
      const variable = unresolvedMatch[0];
      const targetService = unresolvedMatch[1];
      const type = unresolvedMatch[2];

      if (!urlRegistry.has(targetService!)) {
        throw new ScriptError(
          `[${context}] Unresolved template variable: ${variable}. Check build.json dependencies.`
        );
      } else if (type === "public_url") {
        throw new ScriptError(
          `[${context}] Unresolved template variable: ${variable}. Service "${targetService}" does not expose a public port (missing 'port' explicitly defined in build.json).`
        );
      } else {
        throw new ScriptError(`[${context}] Unresolved template variable: ${variable}.`);
      }
    }

    return output;
  };

  // Helper to normalize environment arrays to objects
  const normalizeEnvironment = (serviceConfig: any) => {
    if (Array.isArray(serviceConfig.environment)) {
      const envObj: Record<string, any> = {};
      for (const item of serviceConfig.environment) {
        if (typeof item === "string") {
          const eqIdx = item.indexOf("=");
          if (eqIdx !== -1) {
            envObj[item.slice(0, eqIdx)] = item.slice(eqIdx + 1);
          } else {
            envObj[item] = process.env[item] ?? null;
          }
        }
      }
      serviceConfig.environment = envObj;
    } else if (!serviceConfig.environment || typeof serviceConfig.environment !== "object") {
      serviceConfig.environment = {};
    }
  };

  // --- APP ENV INJECTION ---
  if (buildJson.envOverrides && yml.services && yml.services.app) {
    normalizeEnvironment(yml.services.app);
    for (const [k, v] of Object.entries(buildJson.envOverrides)) {
      yml.services.app.environment[k] = interpolateEnv(v, "App EnvOverrides");
    }
  }

  // --- TESTER ENV INJECTION ---
  if (buildJson.tester?.envOverrides && yml.services && yml.services.tester) {
    normalizeEnvironment(yml.services.tester);
    for (const [k, v] of Object.entries(buildJson.tester.envOverrides)) {
      yml.services.tester.environment[k] = interpolateEnv(v, "Tester EnvOverrides");
    }
  }

  // --- INJECT LOCAL DEPENDENCY PORTS ---
  if (yml.services) {
    for (const dep of dependencies) {
      if (dep.port) {
        // Find target service key: try specified serviceName first, then dep.name
        let targetSvc = dep.serviceName && yml.services[dep.serviceName] ? dep.serviceName : dep.name;
        
        // Fallback if structure is unexpected (e.g. single unnamed service in compose)
        if (!yml.services[targetSvc]) {
          targetSvc = Object.keys(yml.services).find(k => k !== "app" && k !== "tester") || targetSvc;
        }

        if (yml.services[targetSvc]) {
          const portMapping = String(dep.port).includes(":") ? String(dep.port) : `${dep.port}:3000`;
          yml.services[targetSvc].ports = [...(yml.services[targetSvc].ports || []), portMapping];
        }
      }
    }
  }

  // --- DEV FULL MODE INFRA OVERRIDE ---
  if (environment === "dev" && options.full && yml.services?.app) {
    normalizeEnvironment(yml.services.app);
    yml.services.app.environment.INFRA_MODE = "integrated";
  }

  attachName(yml, projectName);

  const finalYamlConfig = stringify(yml);
  return finalYamlConfig;
};
