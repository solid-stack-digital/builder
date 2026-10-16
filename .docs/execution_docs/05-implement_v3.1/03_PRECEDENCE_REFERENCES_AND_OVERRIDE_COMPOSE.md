# Step 3: Precedence, Reference Interpolation, and Override-Compose

This document details the core compilation logic for `buildArgs`: extracting and normalizing `override-compose` build arguments, implementing the multi-layer precedence hierarchy, validating and interpolating Builder references, enforcing the shadowing invariant, ensuring `.env` isolation, and injecting the final map into Docker Compose.

---

## 1. Override-Compose Normalization & Extraction

### 1.1 `normalizeComposeBuildArgs` in [`src/core/composition/composeEnvironment.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeEnvironment.ts)

Docker Compose supports `build.args` either as an object mapping or as a list of strings (`KEY=VALUE` or `KEY`).
Builder normalizes this into a deterministic `Record<string, string>`:

```typescript
export function normalizeComposeBuildArgs(value: unknown, context: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (value == null) return result;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string") {
        throw new ConfigError({ configPath: context, value: item, reason: "Compose build arg entries must be strings" });
      }
      const at = item.indexOf("=");
      if (at < 0) {
        result[item] = "";
      } else {
        result[item.slice(0, at)] = item.slice(at + 1);
      }
    }
    return result;
  }

  if (typeof value !== "object") {
    throw new ConfigError({ configPath: context, value, reason: "Compose build args must be a map or list" });
  }

  for (const [key, val] of Object.entries(value)) {
    if (val === null || val === undefined) {
      result[key] = "";
      continue;
    }
    if (typeof val === "object") {
      throw new ConfigError({ configPath: `${context}.${key}`, value: val, reason: "Compose build arg value must be scalar" });
    }
    result[key] = String(val);
  }
  return result;
}
```

### 1.2 Validation in [`src/core/composition/validateOverrideCompose.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateOverrideCompose.ts)

In `validateAndPrepareMainOverride`, validate `main.build.args`:

```typescript
if (main.build && typeof main.build === "object") {
  const build = main.build as Record<string, unknown>;
  for (const key of Object.keys(build)) {
    if (!["args", "context"].includes(key)) {
      fail(`services.main.build.${key}`, "override cannot change Builder-owned build configuration");
    }
  }
  if (build.args !== undefined) {
    normalizeComposeBuildArgs(build.args, "services.main.build.args");
  }
  // context validations...
}
```

---

## 2. Precedence Hierarchy & Compilation Engine

In [`src/core/composition/compileGraphComposition.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts):

### 2.1 Graph Node Origin Propagation
In `makeGraph`, propagate `buildArgsOrigins`:
```typescript
buildArgsOrigins: new Map([...build.buildArgsOrigins?.get(name) ?? []].map(([key, value]) => [key, copyOrigin(value, root)])),
```

### 2.2 Tracking Override Build Args
In `compileGraphComposition`:
```typescript
const mainOverrideBuildArgs = new Map<NodeId, Record<string, string>>();
// When processing main services in graph.nodes:
if (selected) {
  // ...
  if (prepared.main.build && typeof prepared.main.build === "object") {
    const rawArgs = (prepared.main.build as Record<string, unknown>).args;
    if (rawArgs !== undefined) {
      mainOverrideBuildArgs.set(
        id,
        normalizeComposeBuildArgs(rawArgs, `${selected.origin.configPath}.services.main.build.args`)
      );
    }
  }
}
```

### 2.3 Reference Validation & Interpolation Helpers

Define `resolveJsonBuildArgs` and `validateJsonBuildArgs`:

```typescript
function resolveJsonBuildArgs(
  node: GraphNode,
  graph: EffectiveGraph,
  endpoints: Map<NodeId, Record<string, ResolvedEndpoint>>,
  stage: Environment,
  composition: "service" | "mesh",
  shadowed: Set<string>
): Record<string, string> {
  const output: Record<string, string> = {};
  const main = node.declaration as EffectiveMain;
  for (const [key, value] of Object.entries(main.buildArgs ?? {})) {
    if (shadowed.has(key)) continue;
    const origin = node.buildArgsOrigins.get(key) ?? node.origin;
    output[key] = interpolateBuilderReferences(value, {
      graph,
      endpoints,
      consumer: node.id,
      origin,
      stage,
      composition
    });
  }
  return output;
}

function validateJsonBuildArgs(
  node: GraphNode,
  graph: EffectiveGraph,
  endpoints: Map<NodeId, Record<string, ResolvedEndpoint>>,
  stage: Environment,
  composition: "service" | "mesh",
  shadowed: Set<string>
): void {
  resolveJsonBuildArgs(node, graph, endpoints, stage, composition, shadowed);
}
```

### 2.4 Precedence Merging & Shadowing Logic

```typescript
// During reference pre-validation pass:
for (const [id, node] of graph.nodes) {
  if (node.kind !== "main") continue;
  const overrideArgs = mainOverrideBuildArgs.get(id) ?? {};

  // Compute shadowed keys:
  // In standalone, override shadows all source buildArgs.
  // In mesh, override shadows source buildArgs (scope !== "mesh"),
  // BUT mesh extends.main.buildArgs (scope === "mesh") beats override!
  const shadowed = new Set(
    Object.keys(overrideArgs).filter(key => node.buildArgsOrigins.get(key)?.scope !== "mesh")
  );

  validateJsonBuildArgs(node, graph, endpoints, input.stage, input.composition, shadowed);
}

// During final service assembly:
if (node.kind === "main") {
  const service = compose.services[mainServiceNames.get(id)!]!;
  const overrideArgs = mainOverrideBuildArgs.get(id) ?? {};

  const shadowed = new Set(
    Object.keys(overrideArgs).filter(key => node.buildArgsOrigins.get(key)?.scope !== "mesh")
  );

  const resolvedBuildArgs = resolveJsonBuildArgs(
    node,
    graph,
    endpoints,
    input.stage,
    input.composition,
    shadowed
  );

  // Partition by origin scope:
  const sourceArgs = Object.fromEntries(
    Object.entries(resolvedBuildArgs).filter(([key]) => node.buildArgsOrigins.get(key)?.scope !== "mesh")
  );
  const meshArgs = Object.fromEntries(
    Object.entries(resolvedBuildArgs).filter(([key]) => node.buildArgsOrigins.get(key)?.scope === "mesh")
  );

  // Precedence order (low to high):
  // 1. sourceArgs
  // 2. overrideArgs
  // 3. meshArgs
  // 4. builderOwnedArgs
  const effectiveBuildArgs: Record<string, string> = {
    ...sourceArgs,
    ...overrideArgs,
    ...meshArgs
  };

  // Assign to Docker Compose build args:
  if (Object.keys(effectiveBuildArgs).length > 0 || mainOverrideBuildArgs.has(id)) {
    (service.build as Record<string, unknown>).args = effectiveBuildArgs;
  }
}
```

> [!IMPORTANT]
> Notice how this simultaneously satisfies:
> 1. Standalone precedence: `base < stage < override-compose < Builder`
> 2. Mesh precedence: `source base < source stage < source override < mesh base < mesh stage < Builder`
> 3. Shadowed reference invariant: `NEXT_PUBLIC_API_URL` shadowed by override-compose or mesh extends is never validated or interpolated.

### 2.5 Strict `.env.<stage>` Isolation

Notice that `effectiveBuildArgs` draws solely from:
1. `node.declaration.buildArgs` (from `build.json` and `mesh.json`)
2. `override-compose` (`main.build.args`)

`.env.<stage>` files are loaded exclusively via `service.env_file` for Compose container runtime execution and are completely decoupled from `service.build.args`.

---

## 3. Test Specifications (`BAR12` – `BAR23`)

Add comprehensive test cases in `tests/v3/buildArgs.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { compileMeshComposition } from "../../src/core/mesh/compileMeshComposition.js";
import { fixture } from "./support/fixtures.js";
import { ConfigError } from "../../src/errors/ConfigError.js";

describe("V3.1.0 buildArgs precedence, references, and override-compose", () => {
  it("[BAR12] standalone precedence: base < stage < override-compose", () => {
    const override = "docker-compose.override.yml";
    const root = fixture(
      {
        services: {
          main: {
            buildArgs: { A: "base-a", B: "base-b", C: "base-c" },
            "override-compose": override
          },
          tester: { compose: "t.yml", service: "t" }
        },
        prod: {
          services: {
            main: {
              buildArgs: { B: "prod-b", C: "prod-c" }
            }
          }
        }
      },
      {
        [override]: {
          services: {
            main: {
              build: {
                args: { C: "override-c", D: "override-d" }
              }
            }
          }
        }
      }
    );

    const compiled = compileServiceComposition("prod", root);
    const build = compiled.compose.services.main?.build as any;
    expect(build.args).toEqual({
      A: "base-a",
      B: "prod-b",
      C: "override-c", // override beats prod
      D: "override-d"
    });
  });

  it("[BAR15] mesh extends.main.buildArgs beats source override-compose build args", () => {
    const override = "docker-compose.override.yml";
    const root = fixture(
      {
        name: "test-mesh",
        services: {
          tester: { compose: "t.yml", service: "t" },
          web: {
            source: "./web",
            extends: {
              main: {
                buildArgs: {
                  API_URL: "https://mesh.example.com/api" // BEATS override-compose!
                }
              }
            }
          }
        }
      },
      {},
      {
        web: {
          services: {
            main: {
              buildArgs: { API_URL: "http://localhost:3000" },
              "override-compose": override
            },
            tester: { compose: "t.yml", service: "t" }
          }
        }
      },
      {
        web: {
          [override]: {
            services: {
              main: {
                build: {
                  args: { API_URL: "http://from-override.local" }
                }
              }
            }
          }
        }
      }
    );

    const compiled = compileMeshComposition("dev", root);
    const webMainName = compiled.mainServiceNames.get(JSON.stringify(["web", "main"]))!;
    const build = compiled.compose.services[webMainName]?.build as any;
    expect(build.args.API_URL).toBe("https://mesh.example.com/api");
  });

  it("[BAR16] .env files never implicitly become build args", () => {
    const root = fixture(
      {
        services: {
          main: {
            buildArgs: { EXPLICIT_ARG: "from-build-json" }
          },
          tester: { compose: "t.yml", service: "t" }
        }
      },
      {
        ".env.dev": "SECRET_KEY=supersecret\nIMPLICIT_VAR=do_not_leak\n"
      }
    );

    const compiled = compileServiceComposition("dev", root);
    const build = compiled.compose.services.main?.build as any;
    expect(build.args).toEqual({ EXPLICIT_ARG: "from-build-json" });
    expect(build.args.SECRET_KEY).toBeUndefined();
    expect(build.args.IMPLICIT_VAR).toBeUndefined();
  });

  it("[BAR17] self-reference in buildArgs resolves properly", () => {
    const root = fixture({
      services: {
        main: {
          buildArgs: {
            MY_URL: "${main.endpoints.http.public_url}"
          },
          endpoints: {
            http: { port: 3000, publicPort: 8080, primary: true, scheme: "http" }
          }
        },
        tester: { compose: "t.yml", service: "t" }
      }
    });

    const compiled = compileServiceComposition("dev", root);
    const build = compiled.compose.services.main?.build as any;
    expect(build.args.MY_URL).toBe("http://127.0.0.1:8080");
  });

  it("[BAR18] requisite endpoint reference in buildArgs resolves properly", () => {
    const root = fixture({
      services: {
        main: {
          buildArgs: {
            API_HOST: "${api.endpoints.http.network_host}"
          },
          requisites: { api: "requirement" }
        },
        api: {
          compose: "api.yml",
          endpoints: {
            http: { service: "api", port: 4000, primary: true, scheme: "http" }
          }
        },
        tester: { compose: "t.yml", service: "t" }
      }
    });

    const compiled = compileServiceComposition("dev", root);
    const build = compiled.compose.services.main?.build as any;
    expect(build.args.API_HOST).toBe("svc--api-api-1");
  });

  it("[BAR19] rejects reference without declared requisite", () => {
    const root = fixture({
      services: {
        main: {
          buildArgs: {
            API_HOST: "${api.endpoints.http.network_host}" // MISSING REQUISITE!
          }
        },
        api: {
          compose: "api.yml",
          endpoints: {
            http: { service: "api", port: 4000, primary: true, scheme: "http" }
          }
        },
        tester: { compose: "t.yml", service: "t" }
      }
    });

    expect(() => compileServiceComposition("dev", root)).toThrow(
      expect.objectContaining({
        reason: expect.stringMatching(/outside effective requisite closure/i)
      })
    );
  });

  it("[BAR21] shadowed invalid reference is NOT validated or rejected", () => {
    const override = "docker-compose.override.yml";
    const root = fixture(
      {
        services: {
          main: {
            buildArgs: {
              // Nonexistent requisite reference! Would normally fail!
              API_HOST: "${nonexistent.endpoints.http.network_host}"
            },
            "override-compose": override
          },
          tester: { compose: "t.yml", service: "t" }
        }
      },
      {
        [override]: {
          services: {
            main: {
              build: {
                args: {
                  API_HOST: "http://shadowed.local" // Shadows the invalid reference!
                }
              }
            }
          }
        }
      }
    );

    // MUST NOT THROW because invalid reference is shadowed!
    expect(() => compileServiceComposition("dev", root)).not.toThrow();
    const compiled = compileServiceComposition("dev", root);
    const build = compiled.compose.services.main?.build as any;
    expect(build.args.API_HOST).toBe("http://shadowed.local");
  });

  it("[BAR22] surviving invalid reference fails with descriptive ConfigError", () => {
    const root = fixture({
      services: {
        main: {
          buildArgs: {
            BAD_REF: "${nonexistent.endpoints.http.network_host}"
          }
        },
        tester: { compose: "t.yml", service: "t" }
      }
    });

    expect(() => compileServiceComposition("dev", root)).toThrow(
      expect.objectContaining({
        configPath: "services.main.buildArgs.BAD_REF"
      })
    );
  });
});
```
