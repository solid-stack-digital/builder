# Step 1: Schema, Types, and Strict Validation

This document details the first phase of implementing first-class `buildArgs`: type definitions, Zod schema extensions, JSON Schema generators, and strict validation rules.

---

## 1. Type Additions

### 1.1 Public Types in [`src/types/index.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/types/index.ts)

Add `BuildArgs` and include `buildArgs` in `MainService` and `MainOverlay`:

```typescript
export type BuildArgs = Record<string, string>;

export interface MainService {
  env?: Env;
  buildArgs?: BuildArgs;
  endpoints?: Record<string, MainEndpoint>;
  requisites?: Requisites;
  "override-compose"?: string;
}

export interface MainOverlay {
  env?: Env;
  buildArgs?: BuildArgs;
  endpoints?: Record<string, Partial<MainEndpoint>>;
  requisites?: RequisiteOverlay;
  "override-compose"?: string;
}
```

> [!NOTE]
> `OrdinaryService`, `OrdinaryOverlay`, `TesterService`, and `TesterOverlay` MUST NOT contain `buildArgs`.

### 1.2 Internal Types in [`src/core/config/types.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/types.ts)

Update `EffectiveMain`, `EffectiveBuildConfig`, and `GraphNode`:

```typescript
export type EffectiveMain = MainService & {
  kind: "main";
  env: Record<string, string>;
  buildArgs: Record<string, string>;
  endpoints: Record<string, MainEndpoint>;
  requisites: Requisites;
};

export interface EffectiveBuildConfig {
  name: string;
  services: Record<string, EffectiveService | TesterService>;
  layers: EffectiveBuildLayer[];
  origins: Map<string, Origin>;
  envOrigins: Map<string, Map<string, Origin>>;
  buildArgsOrigins: Map<string, Map<string, Origin>>; // NEW
  requisiteOrigins: Map<string, Map<string, Origin>>;
  sourceFile: string;
  projectDir: string;
}

export interface GraphNode {
  id: NodeId;
  kind: "main" | "ordinary";
  projectDir: string;
  sourceService: string;
  meshRoot?: string;
  declaration: EffectiveService;
  envLayers: EnvironmentLayer[];
  origin: Origin;
  envOrigins: Map<string, Origin>;
  buildArgsOrigins: Map<string, Origin>; // NEW
  requisiteOrigins: Map<string, Origin>;
}
```

---

## 2. Schema Additions & Strict Validation

### 2.1 Zod Schemas in [`src/core/buildSchema.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/buildSchema.ts)

Define the `buildArgs` schema requiring record with string keys and string values:

```typescript
const buildArgs = z.record(z.string(), z.string());
```

Incorporate `buildArgs` into `mainServiceSchema` and `mainOverlaySchema`:

```typescript
export const mainServiceSchema = z.object({
  env: env.optional(),
  buildArgs: buildArgs.optional(),
  endpoints: z.record(identifier, mainEndpointSchema).optional(),
  requisites: requisites.optional(),
  "override-compose": nonblank.optional()
}).strict();

export const mainOverlaySchema = z.object({
  env: env.optional(),
  buildArgs: buildArgs.optional(),
  endpoints: z.record(identifier, mainEndpointSchema.partial().strict()).optional(),
  requisites: requisiteOverlay.optional(),
  "override-compose": nonblank.optional()
}).strict();
```

Because `ordinaryServiceSchema`, `testerServiceSchema`, and their overlays are defined with `.strict()`, any `buildArgs` on ordinary services or tester services will be rejected automatically:

```typescript
// ordinaryServiceSchema has NO buildArgs and is .strict() -> fails on "buildArgs"
// testerServiceSchema has NO buildArgs and is .strict() -> fails on "buildArgs"
```

### 2.2 Mesh Zod Schemas in [`src/core/mesh/meshSchema.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/meshSchema.ts)

In `meshSchema.ts`:
- `meshMainOverlay` extends `mainOverlaySchema`, so it automatically inherits `buildArgs: buildArgs.optional()`.
- `meshOrdinaryOverlay` extends `ordinaryOverlaySchema`, which remains strict without `buildArgs`.
- `testerOverlaySchema` remains strict without `buildArgs`.

Consequently:
- `mesh.services.<name>.extends.main.buildArgs` is accepted.
- `mesh.<stage>.services.<name>.extends.main.buildArgs` is accepted.
- `mesh.services.<name>.extends.db.buildArgs` is rejected.
- `mesh.services.<name>.extends.tester.buildArgs` is rejected.

### 2.3 JSON Schema Generator in [`scripts/generate-schemas.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/scripts/generate-schemas.ts)

Update the code generator to add `buildArgs` to `main(...)`:

```typescript
const env = { type: "object", additionalProperties: { type: "string" } };
const buildArgs = { type: "object", additionalProperties: { type: "string" } };

const main = (overlay = false, mesh = false) => ({
  type: "object",
  properties: {
    env,
    buildArgs,
    endpoints: endpointMap(false, overlay),
    requisites: requisites(mesh, overlay),
    "override-compose": string
  },
  additionalProperties: false
});
```

Execute schema regeneration:
```bash
pnpm tsx scripts/generate-schemas.ts
```
This updates [schemas/build-schema.json](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/schemas/build-schema.json) and [schemas/mesh-schema.json](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/schemas/mesh-schema.json), keeping [tests/v3/repositoryContract.test.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/repositoryContract.test.ts) (`[PKG01]`) passing.

---

## 3. Schema Test Specifications (`BAR01` – `BAR09`)

Create tests in `tests/v3/buildArgs.test.ts` covering all schema rules:

```typescript
import { describe, expect, it } from "vitest";
import { buildJsonSchema } from "../../src/core/buildSchema.js";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";

describe("V3.1.0 buildArgs schema validation", () => {
  const validBaseBuild = {
    name: "test-app",
    services: {
      main: {
        buildArgs: {
          BASE_PATH: "/web",
          API_URL: "https://api.example.com"
        }
      },
      tester: {
        compose: "docker-compose.tester.yml",
        service: "tester"
      }
    }
  };

  it("[BAR01] accepts first-class buildArgs on services.main in build.json", () => {
    expect(buildJsonSchema.safeParse(validBaseBuild).success).toBe(true);
  });

  it("[BAR02] accepts buildArgs across all build stages (dev, prod, test, e2e)", () => {
    const doc = {
      ...validBaseBuild,
      dev: { services: { main: { buildArgs: { STAGE: "dev" } } } },
      prod: { services: { main: { buildArgs: { STAGE: "prod" } } } },
      test: { services: { main: { buildArgs: { STAGE: "test" } } } },
      e2e: { services: { main: { buildArgs: { STAGE: "e2e" } } } }
    };
    expect(buildJsonSchema.safeParse(doc).success).toBe(true);
  });

  it("[BAR03] accepts buildArgs in mesh.json under extends.main", () => {
    const mesh = {
      name: "test-mesh",
      services: {
        tester: { compose: "tester.yml", service: "tester" },
        web: {
          source: "./web",
          extends: {
            main: {
              buildArgs: {
                BASE_PATH: "/mesh-web"
              }
            }
          }
        }
      }
    };
    expect(meshSchema.safeParse(mesh).success).toBe(true);
  });

  it("[BAR04] accepts buildArgs in mesh stages (dev, prod, e2e) under extends.main", () => {
    const mesh = {
      name: "test-mesh",
      services: {
        tester: { compose: "tester.yml", service: "tester" },
        web: { source: "./web" }
      },
      dev: {
        services: {
          web: {
            extends: {
              main: { buildArgs: { DEBUG: "true" } }
            }
          }
        }
      },
      prod: {
        services: {
          web: {
            extends: {
              main: { buildArgs: { OPTIMIZE: "true" } }
            }
          }
        }
      },
      e2e: {
        services: {
          web: {
            extends: {
              main: { buildArgs: { E2E_MODE: "true" } }
            }
          }
        }
      }
    };
    expect(meshSchema.safeParse(mesh).success).toBe(true);
  });

  it("[BAR05] rejects buildArgs on ordinary services", () => {
    const doc = {
      ...validBaseBuild,
      services: {
        ...validBaseBuild.services,
        db: {
          compose: "db.yml",
          service: "db",
          buildArgs: { FOO: "bar" } // FORBIDDEN
        }
      }
    };
    const res = buildJsonSchema.safeParse(doc);
    expect(res.success).toBe(false);
  });

  it("[BAR06] rejects buildArgs on tester service", () => {
    const doc = {
      ...validBaseBuild,
      services: {
        ...validBaseBuild.services,
        tester: {
          compose: "tester.yml",
          service: "tester",
          buildArgs: { FOO: "bar" } // FORBIDDEN
        }
      }
    };
    const res = buildJsonSchema.safeParse(doc);
    expect(res.success).toBe(false);
  });

  it("[BAR07] rejects buildArgs on mesh non-main extends", () => {
    const mesh = {
      name: "test-mesh",
      services: {
        tester: { compose: "tester.yml", service: "tester" },
        api: {
          source: "./api",
          extends: {
            db: {
              buildArgs: { FOO: "bar" } // FORBIDDEN
            }
          }
        }
      }
    };
    const res = meshSchema.safeParse(mesh);
    expect(res.success).toBe(false);
  });

  it("[BAR08] rejects non-string values (numbers, booleans, objects, arrays, null)", () => {
    for (const badValue of [3000, true, false, null, { nested: "val" }, ["array"]]) {
      const doc = {
        ...validBaseBuild,
        services: {
          ...validBaseBuild.services,
          main: {
            buildArgs: {
              KEY: badValue as any
            }
          }
        }
      };
      expect(buildJsonSchema.safeParse(doc).success).toBe(false);
    }
  });

  it("[BAR09] preserves empty string values in buildArgs", () => {
    const doc = {
      ...validBaseBuild,
      services: {
        ...validBaseBuild.services,
        main: {
          buildArgs: {
            BASE_PATH: ""
          }
        }
      }
    };
    const parsed = buildJsonSchema.parse(doc);
    expect(parsed.services.main.buildArgs?.BASE_PATH).toBe("");
  });
});
```
