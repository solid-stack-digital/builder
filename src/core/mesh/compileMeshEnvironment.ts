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

  // Helper to merge top-level resources (volumes, secrets, configs - not networks)
  function mergeTopLevelResources(parsed: any) {
    if (!parsed || typeof parsed !== "object") return;
    for (const key of ["volumes", "secrets", "configs"]) {
      if (parsed[key] && typeof parsed[key] === "object") {
        composeConfig[key] = {
          ...(composeConfig[key] || {}),
          ...parsed[key],
        };
      }
    }
  }

  function rewriteServiceVolume(svc: any, oldKey: string, newKey: string) {
    if (!svc || !Array.isArray(svc.volumes)) return;
    svc.volumes = svc.volumes.map((vol: any) => {
      if (typeof vol === "string") {
        if (vol === oldKey) return newKey;
        if (vol.startsWith(`${oldKey}:`)) {
          return `${newKey}:${vol.slice(oldKey.length + 1)}`;
        }
        return vol;
      }
      if (vol && typeof vol === "object" && vol.source === oldKey) {
        return { ...vol, source: newKey };
      }
      return vol;
    });
  }

  function rewriteServiceSecret(svc: any, oldKey: string, newKey: string) {
    if (!svc || !svc.secrets) return;
    if (Array.isArray(svc.secrets)) {
      svc.secrets = svc.secrets.map((sec: any) => {
        if (sec === oldKey) return newKey;
        if (typeof sec === "object" && sec.source === oldKey) {
          return { ...sec, source: newKey };
        }
        return sec;
      });
    }
  }

  function rewriteServiceConfig(svc: any, oldKey: string, newKey: string) {
    if (!svc || !svc.configs) return;
    if (Array.isArray(svc.configs)) {
      svc.configs = svc.configs.map((cfg: any) => {
        if (cfg === oldKey) return newKey;
        if (typeof cfg === "object" && cfg.source === oldKey) {
          return { ...cfg, source: newKey };
        }
        return cfg;
      });
    }
  }

  // Namespaces mock top-level resources using the provided prefix to isolate independent mocks
  function mergeAndNamespaceMockResources(
    parsed: any,
    namespacePrefix: string,
    baseDir: string,
    targetMeshDir: string
  ) {
    if (!parsed || typeof parsed !== "object") return;

    if (parsed.volumes && typeof parsed.volumes === "object") {
      composeConfig.volumes = composeConfig.volumes || {};
      for (const [volKey, volDef] of Object.entries(parsed.volumes)) {
        const namespacedVolKey = `${namespacePrefix}_${volKey}`;
        composeConfig.volumes[namespacedVolKey] = volDef ?? {};
        if (parsed.services && typeof parsed.services === "object") {
          for (const svc of Object.values(parsed.services) as any[]) {
            rewriteServiceVolume(svc, volKey, namespacedVolKey);
          }
        }
      }
    }

    if (parsed.secrets && typeof parsed.secrets === "object") {
      composeConfig.secrets = composeConfig.secrets || {};
      for (const [secKey, secDef] of Object.entries(parsed.secrets) as [string, any][]) {
        const namespacedSecKey = `${namespacePrefix}_${secKey}`;
        const clonedDef = { ...secDef };
        if (clonedDef.file) {
          clonedDef.file = toComposePath(targetMeshDir, path.resolve(baseDir, clonedDef.file));
        }
        composeConfig.secrets[namespacedSecKey] = clonedDef;
        if (parsed.services && typeof parsed.services === "object") {
          for (const svc of Object.values(parsed.services) as any[]) {
            rewriteServiceSecret(svc, secKey, namespacedSecKey);
          }
        }
      }
    }

    if (parsed.configs && typeof parsed.configs === "object") {
      composeConfig.configs = composeConfig.configs || {};
      for (const [cfgKey, cfgDef] of Object.entries(parsed.configs) as [string, any][]) {
        const namespacedCfgKey = `${namespacePrefix}_${cfgKey}`;
        const clonedDef = { ...cfgDef };
        if (clonedDef.file) {
          clonedDef.file = toComposePath(targetMeshDir, path.resolve(baseDir, clonedDef.file));
        }
        composeConfig.configs[namespacedCfgKey] = clonedDef;
        if (parsed.services && typeof parsed.services === "object") {
          for (const svc of Object.values(parsed.services) as any[]) {
            rewriteServiceConfig(svc, cfgKey, namespacedCfgKey);
          }
        }
      }
    }
  }

  function applyInternalMockDependsOnMapping(svc: any, mapping: Map<string, string>) {
    if (!svc.depends_on) return;
    if (Array.isArray(svc.depends_on)) {
      svc.depends_on = svc.depends_on.map((d: string) => mapping.get(d) || d);
    } else if (typeof svc.depends_on === "object") {
      const newDepends: any = {};
      for (const [k, v] of Object.entries(svc.depends_on)) {
        newDepends[mapping.get(k) || k] = v;
      }
      svc.depends_on = newDepends;
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

      // Merge and namespace top-level resources globally for mesh root mocks
      mergeAndNamespaceMockResources(parsed, `mesh_${depKey}`, meshDir, meshDir);

      const targetServiceName = depDef.service || Object.keys(parsed.services)[0];
      const serviceEntry = targetServiceName ? parsed.services[targetServiceName] : undefined;

      if (!serviceEntry) {
        throw new ScriptError(
          `Service "${targetServiceName}" not found in root dependency compose file: ${depComposePath}`
        );
      }

      // Map internal depends_on for sidecars inside the mock compose
      const sidecarMapping = new Map<string, string>();
      for (const sName of Object.keys(parsed.services)) {
        if (sName === targetServiceName) {
          sidecarMapping.set(sName, depKey);
        } else {
          const companionKey = `${depKey}-${sName}`;
          sidecarMapping.set(sName, composeConfig.services[sName] ? companionKey : sName);
        }
      }

      const resolvedService = resolveServicePaths(serviceEntry, meshDir, meshDir);
      delete resolvedService.container_name;
      normalizeDependsOn(resolvedService);
      applyInternalMockDependsOnMapping(resolvedService, sidecarMapping);

      resolvedService.networks = {
        mesh: {
          aliases: [depKey, targetServiceName].filter(Boolean),
        },
      };

      registerService(depKey, resolvedService, `root dependency "${depKey}"`);

      // Copy any companion services defined in this root dependency
      for (const [sName, sDef] of Object.entries(parsed.services)) {
        if (sName !== targetServiceName) {
          const finalKey = sidecarMapping.get(sName)!;
          const companion = resolveServicePaths(sDef as any, meshDir, meshDir);
          delete companion.container_name;
          normalizeDependsOn(companion);
          applyInternalMockDependsOnMapping(companion, sidecarMapping);
          
          companion.networks = {
            mesh: {
              aliases: [sName, finalKey],
            },
          };
          registerService(finalKey, companion, `companion of root dependency "${depKey}"`);
        }
      }
    }
  }

  // Track provider aliases to add during second pass
  const providerAliases = new Map<string, Set<string>>();
  for (const sName of Object.keys(mesh.services)) {
    providerAliases.set(sName, new Set());
  }

  // Map to track global dependency key to provider for collision detection
  const globalDepAliasToProvider = new Map<string, string>();

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
    let overrideCommand: any = undefined;
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
                environment[item] = process.env[item] ?? null;
              }
            }
          } else if (
            overrideApp.environment &&
            typeof overrideApp.environment === "object"
          ) {
            Object.assign(environment, overrideApp.environment);
          }

          if (overrideApp.command) {
            overrideCommand = overrideApp.command;
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

    // Determine the resolved port for this service across all declarations:
    // 1. serviceConfig.port in mesh.json
    // 2. serviceConfig.healthcheck.port in mesh.json
    // 3. environment.PORT (from envOverrides or stage overrides)
    // 4. .env.{mode} file in service directory
    // 5. .env file in service directory
    // 6. Dockerfile (process.env.PORT || <port> or EXPOSE <port>)
    // 7. Default 3000
    const dockerfilePath = path.resolve(serviceDir, dockerfile);
    const envFilePort =
      extractPortFromEnvFile(path.resolve(serviceDir, `.env.${mode}`)) ||
      extractPortFromEnvFile(path.resolve(serviceDir, ".env"));
    const dockerfilePort = extractPortFromDockerfile(dockerfilePath);

    const resolvedPort =
      serviceConfig.port ||
      (serviceConfig.healthcheck as any)?.port ||
      (environment.PORT ? parseInt(String(environment.PORT), 10) : undefined) ||
      envFilePort ||
      dockerfilePort ||
      3000;

    if (!environment.PORT) {
      environment.PORT = String(resolvedPort);
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

    if (overrideCommand) {
      serviceDef.command = overrideCommand;
    }

    // Healthcheck resolution: mesh.json > override file > default TCP probe (POSIX/Alpine safe)
    if (serviceConfig.healthcheck) {
      if ((serviceConfig.healthcheck as any).type === "tcp") {
        const hcPort = (serviceConfig.healthcheck as any).port || resolvedPort;
        serviceDef.healthcheck = {
          test: [
            "CMD-SHELL",
            `nc -z 127.0.0.1 ${hcPort} || node -e "require('net').connect(${hcPort},'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" || exit 1`,
          ],
          interval: "2s",
          timeout: "2s",
          start_period: "3s",
          retries: 10,
        };
      } else {
        serviceDef.healthcheck = serviceConfig.healthcheck;
      }
    } else if (overrideHealthcheck) {
      serviceDef.healthcheck = overrideHealthcheck;
    } else {
      const portValue = resolvedPort;
      serviceDef.healthcheck = {
        test: [
          "CMD-SHELL",
          `nc -z 127.0.0.1 ${portValue} || node -e "require('net').connect(${portValue},'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" || exit 1`,
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

    const declaredDepNames = new Set(serviceDeps.map((d) => d.name));
    for (const [depKey, targetProvider] of Object.entries(provideMap)) {
      if (!declaredDepNames.has(depKey)) {
        throw new ScriptError(
          `Service "${serviceName}" declares provideDependency/replaceMocks for "${depKey}", but "${depKey}" is not declared in its build.json dependencies.`
        );
      }
      if (!mesh.services[targetProvider]) {
        throw new ScriptError(
          `Service "${serviceName}" maps dependency "${depKey}" to nonexistent service "${targetProvider}".`
        );
      }
      if (
        globalDepAliasToProvider.has(depKey) &&
        globalDepAliasToProvider.get(depKey) !== targetProvider
      ) {
        throw new ScriptError(
          `Dependency alias collision: Dependency key "${depKey}" is mapped to multiple different provider services ("${globalDepAliasToProvider.get(
            depKey
          )}" and "${targetProvider}").`
        );
      }
      if (mesh.services[depKey] && depKey !== targetProvider) {
        throw new ScriptError(
          `Dependency alias conflict: Dependency key "${depKey}" collides with declared mesh service "${depKey}".`
        );
      }
      globalDepAliasToProvider.set(depKey, targetProvider);
    }

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

        // Isolate local mock volumes strictly to the consuming service
        mergeAndNamespaceMockResources(parsed, `${serviceName}_${depKey}`, serviceDir, meshDir);

        if (dep.serviceName && !parsed.services[dep.serviceName]) {
          throw new ScriptError(
            `Service "${dep.serviceName}" declared in build.json not found in mock compose ${depComposePath}`
          );
        }

        const targetMockService = dep.serviceName
          ? parsed.services[dep.serviceName]
          : Object.values(parsed.services)[0];

        if (!targetMockService) {
          throw new ScriptError(
            `No services found in mock compose ${depComposePath}`
          );
        }

        // Map internal depends_on for sidecars inside the mock compose
        const sidecarMapping = new Map<string, string>();
        for (const mName of Object.keys(parsed.services)) {
          if (parsed.services[mName] === targetMockService) {
            sidecarMapping.set(mName, namespacedDepKey);
          } else {
            sidecarMapping.set(mName, `${serviceName}-${mName}`);
          }
        }

        const resolvedMock = resolveServicePaths(
          targetMockService,
          serviceDir,
          meshDir
        );
        delete resolvedMock.ports;
        delete resolvedMock.container_name;
        normalizeDependsOn(resolvedMock);
        applyInternalMockDependsOnMapping(resolvedMock, sidecarMapping);

        resolvedMock.networks = {
          [`${serviceName}_net`]: {
            aliases: [depKey, namespacedDepKey],
          },
        };

        registerService(namespacedDepKey, resolvedMock, `mock dependency for "${serviceName}"`);

        // Copy companion sidecars in mock compose file if any
        for (const [mName, mDef] of Object.entries(parsed.services)) {
          if (mDef !== targetMockService) {
            const sidecarKey = sidecarMapping.get(mName)!;
            if (!composeConfig.services[sidecarKey]) {
              const resolvedSidecar = resolveServicePaths(mDef as any, serviceDir, meshDir);
              delete resolvedSidecar.ports;
              delete resolvedSidecar.container_name;
              normalizeDependsOn(resolvedSidecar);
              applyInternalMockDependsOnMapping(resolvedSidecar, sidecarMapping);

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

  // Second pass: Add provider aliases to mesh services for dependency routing
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
          for (const [tKey, tDef] of Object.entries(parsed.services) as [string, any][]) {
            const resolvedTester = resolveServicePaths(
              tDef,
              testerDir,
              meshDir
            );
            delete resolvedTester.container_name;
            normalizeDependsOn(resolvedTester);

            resolvedTester.networks = {
              mesh: {
                aliases: [tKey, ...(tKey === firstKey ? ["tester"] : [])],
              },
            };

            // Tester main service depends on all mesh app services
            if (tKey === firstKey) {
              resolvedTester.depends_on = resolvedTester.depends_on || {};
              for (const sName of Object.keys(mesh.services)) {
                resolvedTester.depends_on[`${sName}-app`] = {
                  condition: "service_healthy",
                };
              }
            }

            registerService(tKey, resolvedTester, `tester service "${tKey}"`);
          }
        }
      }
    }
  }

  // Adjust depends_on: fall back to service_started if target service has no healthcheck
  for (const svc of Object.values(composeConfig.services) as any[]) {
    if (svc.depends_on && typeof svc.depends_on === "object") {
      for (const [depTarget, depOpts] of Object.entries(svc.depends_on) as [
        string,
        any,
      ][]) {
        const targetSvc = composeConfig.services[depTarget];
        if (
          targetSvc &&
          (!targetSvc.healthcheck || (targetSvc.healthcheck as any).disable) &&
          depOpts &&
          depOpts.condition === "service_healthy"
        ) {
          depOpts.condition = "service_started";
        }
      }
    }
  }

  const generatedYaml = stringify(composeConfig);

  if (options.validateWithDocker === false) {
    return { yaml: generatedYaml, testerServiceName };
  }

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

function extractPortFromEnvFile(filePath: string): number | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [k, ...vParts] = trimmed.split("=");
      if (k && k.trim() === "PORT") {
        const rawVal = vParts.join("=").trim().replace(/^["']|["']$/g, "");
        const val = parseInt(rawVal, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

function extractPortFromDockerfile(dockerfilePath: string): number | undefined {
  if (!existsSync(dockerfilePath)) return undefined;
  try {
    const content = readFileSync(dockerfilePath, "utf-8");
    const portMatch =
      content.match(/process\.env\.PORT\s*\|\|\s*(\d+)/) ||
      content.match(/EXPOSE\s+(\d+)/);
    if (portMatch && portMatch[1]) {
      const val = parseInt(portMatch[1], 10);
      if (!isNaN(val) && val > 0) return val;
    }
  } catch {
    // ignore
  }
  return undefined;
}
