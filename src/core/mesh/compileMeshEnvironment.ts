import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { ScriptError } from "../../errors/ScriptError.js";
import { extractOverrides } from "../../utils/extractOverrides.js";
import { getBuildJson } from "../../utils/getBuildJson.js";
import { getMeshJson } from "./getMeshJson.js";
import type { MeshConfig } from "./types.js";

export interface CompileMeshOptions {
  includeTester?: boolean;
  validateWithDocker?: boolean;
}

export interface CompileMeshResult {
  yaml: string;
  testerServiceName?: string | undefined;
}

function normalizeProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

export function compileMeshEnvironment(
  mode: "dev" | "prod",
  rawMeshDir: string = process.cwd(),
  options: CompileMeshOptions = {}
): CompileMeshResult {
  const meshDir = path.resolve(rawMeshDir);
  const mesh: MeshConfig = getMeshJson(meshDir);
  const rawProjectName = mesh.name || path.basename(meshDir);
  const projectName = normalizeProjectName(rawProjectName);

  const composeConfig: Record<string, any> = {
    name: projectName,
    networks: {
      mesh: {},
    },
    services: {},
  };

  // Pre-register private networks for each mesh service
  for (const serviceName of Object.keys(mesh.services)) {
    composeConfig.networks[`${serviceName}_net`] = {};
  }

  // 1. Process root-level dependencies if defined in mesh.json
  if (mesh.dependencies && typeof mesh.dependencies === "object") {
    for (const [depKey, depDef] of Object.entries(mesh.dependencies)) {
      const depComposePath = path.resolve(meshDir, depDef.path);
      if (existsSync(depComposePath)) {
        const raw = readFileSync(depComposePath, "utf-8");
        const parsed = parse(raw);
        if (parsed && parsed.services) {
          const serviceEntry = depDef.service
            ? parsed.services[depDef.service]
            : Object.values(parsed.services)[0];
          if (serviceEntry) {
            const resolvedService = resolveServicePaths(
              serviceEntry,
              meshDir,
              meshDir
            );
            resolvedService.networks = {
              mesh: {
                aliases: [depKey],
              },
            };
            composeConfig.services[depKey] = resolvedService;
          }
        }
      }
    }
  }

  // 2. Process each service in mesh.services
  for (const [serviceName, serviceConfig] of Object.entries(mesh.services)) {
    const serviceDir = path.resolve(meshDir, serviceConfig.path);
    const serviceBuildJson = getBuildJson(serviceDir);
    const serviceOverrides = extractOverrides(serviceBuildJson, serviceDir);
    const rawRelServiceDir = path.relative(meshDir, serviceDir) || ".";
    const relServiceDir =
      rawRelServiceDir.startsWith(".") || rawRelServiceDir.startsWith("/")
        ? rawRelServiceDir
        : `./${rawRelServiceDir}`;

    const dockerfile = (serviceBuildJson.dockerfile as string) || "Dockerfile";

    // Collect environment variables
    const envOverrides = serviceConfig.envOverrides || {};
    const environment: Record<string, any> = {
      INFRA_MODE: "integrated",
      EXEC_MODE: mode,
      ...envOverrides,
    };

    // Check for override file (e.g. dev or prod override)
    let overrideVolumes: string[] = [];
    const stageOverride = serviceOverrides[mode];
    if (stageOverride && existsSync(stageOverride.path)) {
      try {
        const overrideYaml = parse(readFileSync(stageOverride.path, "utf-8"));
        const overrideApp =
          overrideYaml?.services?.app ||
          overrideYaml?.services?.[serviceName] ||
          Object.values(overrideYaml?.services || {})[0];

        if (overrideApp) {
          if (Array.isArray(overrideApp.environment)) {
            for (const item of overrideApp.environment) {
              const eqIdx = item.indexOf("=");
              if (eqIdx !== -1) {
                environment[item.slice(0, eqIdx)] = item.slice(eqIdx + 1);
              }
            }
          } else if (
            overrideApp.environment &&
            typeof overrideApp.environment === "object"
          ) {
            Object.assign(environment, overrideApp.environment);
          }

          if (Array.isArray(overrideApp.volumes)) {
            overrideVolumes = overrideApp.volumes.map((vol: string) => {
              if (vol.startsWith("/") || !vol.includes(":")) return vol;
              const [host, container] = vol.split(":");
              if (!host || !container) return vol;
              const rel = path.relative(meshDir, path.resolve(serviceDir, host));
              const formattedRel =
                rel.startsWith(".") || rel.startsWith("/") ? rel : `./${rel}`;
              return `${formattedRel}:${container}`;
            });
          }
        }
      } catch (err: any) {
        throw new ScriptError(
          `Failed to parse override file ${stageOverride.path}: ${err?.message || String(err)}`
        );
      }
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
      const relEnv = path.relative(meshDir, envFilePath);
      serviceDef.env_file = [
        relEnv.startsWith(".") || relEnv.startsWith("/") ? relEnv : `./${relEnv}`,
      ];
    }

    // Hot-reloading volumes for dev mode
    if (mode === "dev") {
      const volSet = new Set<string>();
      volSet.add(`${relServiceDir}:/app`);
      volSet.add("/app/node_modules");
      for (const v of overrideVolumes) {
        volSet.add(v);
      }
      serviceDef.volumes = Array.from(volSet);
    }

    // Port mapping if serviceConfig.port is declared
    if (serviceConfig.port) {
      serviceDef.ports = [`${serviceConfig.port}:${serviceConfig.port}`];
    }

    // Default healthcheck to ensure service_healthy condition works in dev and prod
    serviceDef.healthcheck = {
      test: [
        "CMD",
        "node",
        "-e",
        "require('net').connect(process.env.PORT || 3000, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))",
      ],
      interval: "2s",
      timeout: "2s",
      start_period: "3s",
      retries: 10,
    };

    // Networks for app service: connected to both global mesh and service private network
    const namespacedAppKey = `${serviceName}-app`;
    serviceDef.networks = {
      mesh: {
        aliases: [serviceName, namespacedAppKey],
      },
      [`${serviceName}_net`]: {
        aliases: ["app", serviceName, namespacedAppKey],
      },
    };

    // Resolve dependencies
    const provideMap = {
      ...(serviceConfig.replaceMocks || {}),
      ...(serviceConfig.provideDependency || {}),
    };

    if (serviceBuildJson.dependencies) {
      for (const [depKey, depInfo] of Object.entries(
        serviceBuildJson.dependencies as Record<string, any>
      )) {
        if (provideMap[depKey]) {
          // Dependency is provided by fellow service in the mesh
          const fellowService = provideMap[depKey];
          const fellowAppKey = `${fellowService}-app`;
          serviceDef.depends_on[fellowAppKey] = {
            condition: "service_healthy",
          };
        } else if (mesh.dependencies && mesh.dependencies[depKey]) {
          // Dependency is provided at the root mesh.json level
          serviceDef.depends_on[depKey] = {
            condition: "service_healthy",
          };
        } else {
          // Dependency is scoped to this service: `${serviceName}-${depKey}`
          const namespacedDepKey = `${serviceName}-${depKey}`;
          serviceDef.depends_on[namespacedDepKey] = {
            condition: "service_healthy",
          };

          const depComposePath = path.resolve(serviceDir, depInfo.path);
          if (!existsSync(depComposePath)) {
            throw new ScriptError(
              `Mock compose file for dependency "${depKey}" not found: ${depComposePath}`
            );
          }
          const raw = readFileSync(depComposePath, "utf-8");
          const parsed = parse(raw);
          if (!parsed?.services) {
            throw new ScriptError(
              `Invalid compose file for dependency "${depKey}": missing "services"`
            );
          }

          const mockServiceEntry = depInfo.service
            ? parsed.services[depInfo.service]
            : Object.values(parsed.services)[0];

          if (!mockServiceEntry) {
            throw new ScriptError(
              `Service "${depInfo.service}" not found in mock compose ${depComposePath}`
            );
          }

          const resolvedMock = resolveServicePaths(
            mockServiceEntry,
            serviceDir,
            meshDir
          );

          // Strip ports from mock service to avoid host port allocation collisions
          delete resolvedMock.ports;

          // Connect mock service exclusively to this service's private network
          resolvedMock.networks = {
            [`${serviceName}_net`]: {
              aliases: [depKey, namespacedDepKey],
            },
          };

          composeConfig.services[namespacedDepKey] = resolvedMock;
        }
      }
    }

    if (Object.keys(serviceDef.depends_on).length === 0) {
      delete serviceDef.depends_on;
    }

    composeConfig.services[namespacedAppKey] = serviceDef;
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
      if (parsed?.services) {
        const firstKey = Object.keys(parsed.services)[0];
        if (firstKey && parsed.services[firstKey]) {
          testerServiceName = firstKey;
          const testerDef = parsed.services[firstKey];

          const resolvedTester = resolveServicePaths(
            testerDef,
            testerDir,
            meshDir
          );

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

          composeConfig.services[firstKey] = resolvedTester;
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
      `Failed to run docker compose config: ${result.error.message}`
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
 * Helper to resolve relative file paths (build context, volumes) in a compose service block
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
      const absContext = path.resolve(baseDir, cloned.build);
      const rel = path.relative(meshDir, absContext) || ".";
      cloned.build = rel.startsWith(".") || rel.startsWith("/") ? rel : `./${rel}`;
    } else if (cloned.build.context) {
      const absContext = path.resolve(baseDir, cloned.build.context);
      const rel = path.relative(meshDir, absContext) || ".";
      cloned.build.context = rel.startsWith(".") || rel.startsWith("/") ? rel : `./${rel}`;
    }
  }

  if (Array.isArray(cloned.volumes)) {
    cloned.volumes = cloned.volumes.map((vol: string) => {
      if (typeof vol !== "string") return vol;
      const parts = vol.split(":");
      const host = parts[0];
      if (parts.length >= 2 && host && !host.startsWith("/")) {
        const absHost = path.resolve(baseDir, host);
        const relHost = path.relative(meshDir, absHost);
        const formattedRelHost =
          relHost.startsWith(".") || relHost.startsWith("/") ? relHost : `./${relHost}`;
        return `${formattedRelHost}:${parts.slice(1).join(":")}`;
      }
      return vol;
    });
  }

  return cloned;
}
