import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { ScriptError } from "../../errors/ScriptError.js";
import { extractBuildDeps } from "../../utils/extractBuildDeps.js";
import { extractOverrides } from "../../utils/extractOverrides.js";
import { getBuildJson } from "../../utils/getBuildJson.js";
import { isBindMount, resolveProjectDir, toComposePath } from "../../utils/paths.js";
import { deriveProjectName } from "../../utils/projectName.js";
import { normalizeDependsOn } from "../../utils/ymlMods/normalizeDependsOn.js";
import { getMeshJson } from "./getMeshJson.js";
import type { MeshConfig, MeshServiceConfig } from "./types.js";

export interface CompileMeshOptions {
  includeTester?: boolean | undefined;
  validateWithDocker?: boolean | undefined;
}

export interface CompileMeshResult {
  yaml: string;
  testerServiceName?: string | undefined;
}

export function compileMeshEnvironment(
  mode: "dev" | "prod",
  rawMeshDir: string = process.cwd(),
  options: CompileMeshOptions = {}
): CompileMeshResult {
  const meshDir = resolveProjectDir(rawMeshDir);
  const mesh: MeshConfig = getMeshJson(meshDir);
  const rawProjectName = mesh.name || path.basename(meshDir);
  const projectName = deriveProjectName(
    rawProjectName,
    options.includeTester ? "e2e" : mode
  );

  const composeConfig: Record<string, any> = {
    name: projectName,
    networks: {
      mesh: {},
    },
    services: {},
  };

  // Helper to merge top-level resources (volumes, networks, secrets, configs)
  function mergeTopLevelResources(parsed: any) {
    if (!parsed || typeof parsed !== "object") return;
    for (const key of ["volumes", "networks", "secrets", "configs"]) {
      if (parsed[key] && typeof parsed[key] === "object") {
        composeConfig[key] = {
          ...(composeConfig[key] || {}),
          ...parsed[key],
        };
      }
    }
  }

  // Helper to safely register a service with collision detection
  function registerService(key: string, serviceDef: any, origin: string) {
    if (composeConfig.services[key]) {
      throw new ScriptError(
        `Service name collision in mesh compose configuration: Service "${key}" from ${origin} conflicts with an existing service definition.`
      );
    }
    composeConfig.services[key] = serviceDef;
  }

  // Pre-register private networks for each mesh service
  for (const serviceName of Object.keys(mesh.services)) {
    composeConfig.networks[`${serviceName}_net`] = {};
  }

  // 1. Process root-level dependencies if defined in mesh.json
  if (mesh.dependencies && typeof mesh.dependencies === "object") {
    for (const [depKey, depDef] of Object.entries(mesh.dependencies)) {
      const depComposePath = path.resolve(meshDir, depDef.path);
      if (!existsSync(depComposePath)) {
        throw new ScriptError(
          `Root dependency compose file not found: ${depComposePath}`
        );
      }

      const raw = readFileSync(depComposePath, "utf-8");
      const parsed = parse(raw);
      if (!parsed?.services || typeof parsed.services !== "object") {
        throw new ScriptError(
          `Root dependency compose file "${depDef.path}" does not define any services.`
        );
      }

      // Merge top-level resources
      mergeTopLevelResources(parsed);

      const targetServiceName = depDef.service || Object.keys(parsed.services)[0];
      const serviceEntry = targetServiceName ? parsed.services[targetServiceName] : undefined;

      if (!serviceEntry) {
        throw new ScriptError(
          `Service "${targetServiceName}" not found in root dependency compose file: ${depComposePath}`
        );
      }

      const resolvedService = resolveServicePaths(serviceEntry, meshDir, meshDir);
      delete resolvedService.container_name;
      normalizeDependsOn(resolvedService);

      resolvedService.networks = {
        mesh: {
          aliases: [depKey, targetServiceName].filter(Boolean),
        },
      };

      registerService(depKey, resolvedService, `root dependency "${depKey}"`);

      // Copy any companion services defined in this root dependency
      for (const [sName, sDef] of Object.entries(parsed.services)) {
        if (sName !== targetServiceName && !composeConfig.services[sName]) {
          const companion = resolveServicePaths(sDef as any, meshDir, meshDir);
          delete companion.container_name;
          normalizeDependsOn(companion);
          companion.networks = {
            mesh: {
              aliases: [sName],
            },
          };
          registerService(sName, companion, `companion of root dependency "${depKey}"`);
        }
      }
    }
  }

  // Track provider aliases to add during second pass
  // Map: providerServiceName -> Set of aliases (e.g. dependency keys)
  const providerAliases = new Map<string, Set<string>>();
  for (const sName of Object.keys(mesh.services)) {
    providerAliases.set(sName, new Set());
  }

  // 2. Process each service in mesh.services
  for (const [serviceName, serviceConfig] of Object.entries(mesh.services)) {
    const serviceDir = path.resolve(meshDir, serviceConfig.path);
    const serviceBuildJson = getBuildJson(serviceDir);
    const serviceOverrides = extractOverrides(serviceBuildJson, serviceDir);
    const serviceDeps = extractBuildDeps(serviceBuildJson, serviceDir);
    const relServiceDir = toComposePath(meshDir, serviceDir);

    const dockerfile = (serviceBuildJson.dockerfile as string) || "Dockerfile";

    // Build base environment
    const environment: Record<string, any> = {
      INFRA_MODE: "integrated",
      EXEC_MODE: mode,
    };

    if (serviceConfig.port) {
      environment.PORT = String(serviceConfig.port);
    }

    // Check for override file (e.g. dev or prod override)
    let overrideVolumes: any[] = [];
    let overrideHealthcheck: any = undefined;
    const stageOverride = serviceOverrides[mode];

    if (stageOverride && existsSync(stageOverride.path)) {
      try {
        const overrideYaml = parse(readFileSync(stageOverride.path, "utf-8"));
        mergeTopLevelResources(overrideYaml);

        const overrideApp =
          overrideYaml?.services?.app ||
          overrideYaml?.services?.[serviceName];

        if (!overrideApp && overrideYaml?.services && Object.keys(overrideYaml.services).length > 0) {
          throw new ScriptError(
            `Override file "${stageOverride.path}" must define service "app" or "${serviceName}".`
          );
        }

        if (overrideApp) {
          if (Array.isArray(overrideApp.environment)) {
            for (const item of overrideApp.environment) {
              const eqIdx = item.indexOf("=");
              if (eqIdx !== -1) {
                environment[item.slice(0, eqIdx)] = item.slice(eqIdx + 1);
              } else {
                environment[item] = "";
              }
            }
          } else if (
            overrideApp.environment &&
            typeof overrideApp.environment === "object"
          ) {
            Object.assign(environment, overrideApp.environment);
          }

          if (Array.isArray(overrideApp.volumes)) {
            overrideVolumes = overrideApp.volumes.map((vol: any) =>
              resolveVolumeEntry(vol, serviceDir, meshDir)
            );
          }

          if (overrideApp.healthcheck) {
            overrideHealthcheck = overrideApp.healthcheck;
          }
        }
      } catch (err: unknown) {
        if (err instanceof ScriptError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new ScriptError(
          `Failed to parse override file ${stageOverride.path}: ${msg}`
        );
      }
    }

    // Apply specific mesh.json envOverrides LAST so they take highest precedence
    if (serviceConfig.envOverrides) {
      Object.assign(environment, serviceConfig.envOverrides);
    }

    const serviceDef: Record<string, any> = {
      build: {
        context: relServiceDir,
        dockerfile: dockerfile,
        target: mode,
      },
      init: true,
      logging: {
        driver: "json-file",
        options: {
          "max-size": "10m",
          "max-file": "3",
        },
      },
      environment,
      depends_on: {},
    };

    // Check for service-level .env file
    const envFilePath = path.resolve(serviceDir, `.env.${mode}`);
    if (existsSync(envFilePath)) {
      serviceDef.env_file = [toComposePath(meshDir, envFilePath)];
    }

    // Hot-reloading volumes for dev mode
    if (mode === "dev") {
      const volSet = new Set<string>();
      volSet.add(`${relServiceDir}:/app`);
      volSet.add("/app/node_modules");
      for (const v of overrideVolumes) {
        if (typeof v === "string") {
          volSet.add(v);
        }
      }
      serviceDef.volumes = Array.from(volSet);
    }

    // Port mapping if serviceConfig.port is declared
    if (serviceConfig.port) {
      serviceDef.ports = [`${serviceConfig.port}:${serviceConfig.port}`];
    }

    // Healthcheck resolution: mesh.json > override file > default Node probe
    if (serviceConfig.healthcheck) {
      serviceDef.healthcheck = serviceConfig.healthcheck;
    } else if (overrideHealthcheck) {
      serviceDef.healthcheck = overrideHealthcheck;
    } else {
      const portValue = serviceConfig.port || 3000;
      serviceDef.healthcheck = {
        test: [
          "CMD",
          "node",
          "-e",
          `require('net').connect(process.env.PORT || ${portValue}, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))`,
        ],
        interval: "2s",
        timeout: "2s",
        start_period: "3s",
        retries: 10,
      };
    }

    // Networks for app service
    const namespacedAppKey = `${serviceName}-app`;
    serviceDef.networks = {
      mesh: {
        aliases: [serviceName, namespacedAppKey],
      },
      [`${serviceName}_net`]: {
        aliases: ["app", serviceName, namespacedAppKey],
      },
    };

    // Resolve dependencies using validated extractBuildDeps
    const provideMap = {
      ...(serviceConfig.replaceMocks || {}),
      ...(serviceConfig.provideDependency || {}),
    };

    for (const dep of serviceDeps) {
      const depKey = dep.name;

      if (provideMap[depKey]) {
        // Dependency is provided by fellow service in the mesh
        const fellowService = provideMap[depKey]!;
        const fellowAppKey = `${fellowService}-app`;
        serviceDef.depends_on[fellowAppKey] = {
          condition: "service_healthy",
        };
        // Record that fellowService should alias depKey on mesh network
        providerAliases.get(fellowService)?.add(depKey);
      } else if (mesh.dependencies && mesh.dependencies[depKey]) {
        // Dependency is provided at root mesh.json level
        serviceDef.depends_on[depKey] = {
          condition: "service_healthy",
        };
      } else {
        // Local mock dependency
        const namespacedDepKey = `${serviceName}-${depKey}`;
        serviceDef.depends_on[namespacedDepKey] = {
          condition: "service_healthy",
        };

        const depComposePath = dep.path;
        if (!existsSync(depComposePath)) {
          throw new ScriptError(
            `Mock compose file for dependency "${depKey}" not found: ${depComposePath}`
          );
        }
        const raw = readFileSync(depComposePath, "utf-8");
        const parsed = parse(raw);
        if (!parsed?.services || typeof parsed.services !== "object") {
          throw new ScriptError(
            `Invalid compose file for dependency "${depKey}": missing "services"`
          );
        }

        mergeTopLevelResources(parsed);

        const targetMockService =
          dep.serviceName && parsed.services[dep.serviceName]
            ? parsed.services[dep.serviceName]
            : Object.values(parsed.services)[0];

        if (!targetMockService) {
          throw new ScriptError(
            `Service "${dep.serviceName}" not found in mock compose ${depComposePath}`
          );
        }

        const resolvedMock = resolveServicePaths(
          targetMockService,
          serviceDir,
          meshDir
        );
        delete resolvedMock.ports;
        delete resolvedMock.container_name;
        normalizeDependsOn(resolvedMock);

        resolvedMock.networks = {
          [`${serviceName}_net`]: {
            aliases: [depKey, namespacedDepKey],
          },
        };

        registerService(namespacedDepKey, resolvedMock, `mock dependency for "${serviceName}"`);

        // Copy companion sidecars in mock compose file if any
        for (const [mName, mDef] of Object.entries(parsed.services)) {
          if (mDef !== targetMockService) {
            const sidecarKey = `${serviceName}-${mName}`;
            if (!composeConfig.services[sidecarKey]) {
              const resolvedSidecar = resolveServicePaths(mDef as any, serviceDir, meshDir);
              delete resolvedSidecar.ports;
              delete resolvedSidecar.container_name;
              normalizeDependsOn(resolvedSidecar);
              resolvedSidecar.networks = {
                [`${serviceName}_net`]: {
                  aliases: [mName, sidecarKey],
                },
              };
              registerService(sidecarKey, resolvedSidecar, `sidecar of mock "${depKey}"`);
            }
          }
        }
      }
    }

    if (Object.keys(serviceDef.depends_on).length === 0) {
      delete serviceDef.depends_on;
    }

    registerService(namespacedAppKey, serviceDef, `mesh service "${serviceName}"`);
  }

  // Second pass: Add provider aliases to mesh services for dependency routing (H9)
  for (const [providerName, aliases] of providerAliases.entries()) {
    const appKey = `${providerName}-app`;
    const serviceDef = composeConfig.services[appKey];
    if (serviceDef && serviceDef.networks?.mesh) {
      const existingAliases = new Set<string>(serviceDef.networks.mesh.aliases || []);
      for (const alias of aliases) {
        existingAliases.add(alias);
      }
      serviceDef.networks.mesh.aliases = Array.from(existingAliases);
    }
  }

  // 3. Optional Tester inclusion (for global test & test-e2e)
  let testerServiceName: string | undefined;
  if (options.includeTester && mesh.tester) {
    const testerDir = path.resolve(meshDir, mesh.tester.path);
    const composeRel = mesh.tester.compose || "docker-compose.yml";
    const testerComposePath = path.resolve(testerDir, composeRel);

    if (existsSync(testerComposePath)) {
      const raw = readFileSync(testerComposePath, "utf-8");
      const parsed = parse(raw);
      mergeTopLevelResources(parsed);

      if (parsed?.services && typeof parsed.services === "object") {
        const firstKey = Object.keys(parsed.services)[0];
        if (firstKey && parsed.services[firstKey]) {
          testerServiceName = firstKey;
          const testerDef = parsed.services[firstKey];

          const resolvedTester = resolveServicePaths(
            testerDef,
            testerDir,
            meshDir
          );
          delete resolvedTester.container_name;
          normalizeDependsOn(resolvedTester);

          resolvedTester.networks = {
            mesh: {
              aliases: ["tester", firstKey],
            },
          };

          // Tester depends on all mesh app services
          resolvedTester.depends_on = resolvedTester.depends_on || {};
          for (const sName of Object.keys(mesh.services)) {
            resolvedTester.depends_on[`${sName}-app`] = {
              condition: "service_healthy",
            };
          }

          registerService(firstKey, resolvedTester, `tester service "${firstKey}"`);
        }
      }
    }
  }

  const generatedYaml = stringify(composeConfig);

  // If validateWithDocker is explicitly false, return directly
  if (options.validateWithDocker === false) {
    return { yaml: generatedYaml, testerServiceName };
  }

  // Validate and normalize through docker compose config
  const result = spawnSync(
    "docker",
    [
      "compose",
      "-p",
      projectName,
      "--project-directory",
      meshDir,
      "-f",
      "-",
      "config",
    ],
    {
      cwd: meshDir,
      input: generatedYaml,
      encoding: "utf-8",
    }
  );

  if (result.error) {
    throw new ScriptError(
      `Failed to run docker compose config: ${result.error.message}`,
      { cause: result.error }
    );
  }

  if (result.status !== 0) {
    throw new ScriptError(
      `❌ Failed to validate mesh compose configuration:\n${
        result.stderr || result.stdout
      }`
    );
  }

  return {
    yaml: result.stdout || generatedYaml,
    testerServiceName,
  };
}

/**
 * Resolves a volume entry (string or object form), rebasing host bind mounts
 * relative to the mesh root directory while preserving named volumes.
 */
function resolveVolumeEntry(vol: any, baseDir: string, meshDir: string): any {
  if (typeof vol === "string") {
    if (!vol.includes(":")) {
      return vol; // anonymous volume, e.g. /app/node_modules
    }
    const parts = vol.split(":");
    const host = parts[0]!;
    if (isBindMount(host)) {
      const absHost = path.resolve(baseDir, host);
      const formattedRel = toComposePath(meshDir, absHost);
      return `${formattedRel}:${parts.slice(1).join(":")}`;
    }
    // Named volume like db_data:/var/lib/postgresql: keep as-is
    return vol;
  }

  if (vol && typeof vol === "object") {
    const cloned = { ...vol };
    if (cloned.type === "bind" && cloned.source && typeof cloned.source === "string") {
      const absSource = path.resolve(baseDir, cloned.source);
      cloned.source = toComposePath(meshDir, absSource);
    }
    return cloned;
  }

  return vol;
}

/**
 * Helper to resolve relative file paths (build context, volumes, env_file) in a compose service block
 * relative to the mesh root directory.
 */
function resolveServicePaths(
  service: Record<string, any>,
  baseDir: string,
  meshDir: string
): Record<string, any> {
  const cloned = JSON.parse(JSON.stringify(service));

  if (cloned.build) {
    if (typeof cloned.build === "string") {
      cloned.build = toComposePath(meshDir, path.resolve(baseDir, cloned.build));
    } else if (cloned.build.context) {
      cloned.build.context = toComposePath(
        meshDir,
        path.resolve(baseDir, cloned.build.context)
      );
    }
  }

  if (Array.isArray(cloned.volumes)) {
    cloned.volumes = cloned.volumes.map((vol: any) =>
      resolveVolumeEntry(vol, baseDir, meshDir)
    );
  }

  if (Array.isArray(cloned.env_file)) {
    cloned.env_file = cloned.env_file.map((ef: any) => {
      if (typeof ef === "string") {
        return toComposePath(meshDir, path.resolve(baseDir, ef));
      }
      if (ef && typeof ef === "object" && ef.path) {
        return {
          ...ef,
          path: toComposePath(meshDir, path.resolve(baseDir, ef.path)),
        };
      }
      return ef;
    });
  } else if (typeof cloned.env_file === "string") {
    cloned.env_file = toComposePath(meshDir, path.resolve(baseDir, cloned.env_file));
  }

  normalizeDependsOn(cloned);

  return cloned;
}
