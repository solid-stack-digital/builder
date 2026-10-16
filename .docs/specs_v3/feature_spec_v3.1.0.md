# Feature Specification — First-Class `buildArgs` Support

**Package:** `@solid-stack/builder`  
**Target version:** `3.0.0`  
**Feature:** First-class Docker build arguments from `build.json` and `mesh.json`  
**Status:** Implementation specification  
**Scope:** `services.main` only

---

## 1. Summary

`@solid-stack/builder@3.0.0` MUST support first-class Docker build arguments through Builder configuration.

The field is:

```json
"buildArgs": {
  "KEY": "value"
}
```

`buildArgs` is supported only on the special `services.main` service.

It may be supplied from:

- base `build.json`;
- build-stage overrides;
- base `mesh.json` source extensions;
- mesh-stage source extensions;
- `override-compose` build arguments.

`.env.<stage>` files never implicitly become build arguments.

The feature exists to make common build-time configuration explicit and Builder-native while preserving `override-compose` for advanced Docker/Compose build behavior.

---

## 2. Goals

This feature MUST provide:

1. first-class build arguments for `services.main`;
2. stage-aware build-arg overrides;
3. mesh-level build-arg overrides;
4. E2E production-shaped build-arg inheritance;
5. the same structural authority ordering used by `env`;
6. Builder reference support in build-arg values;
7. merge-before-reference-validation behavior;
8. deterministic final Docker build arguments;
9. compatibility with build arguments supplied by `override-compose`;
10. fail-fast validation for invalid locations, types, or references.

---

## 3. Non-Goals

This feature does NOT:

- turn `.env.dev`, `.env.prod`, `.env.test`, `.env.e2e`, or `.env.e2e-tester` into build arguments;
- allow ordinary Compose-backed services to define Builder-level `buildArgs`;
- allow `services.tester` to define `buildArgs`;
- replace `override-compose`;
- provide Docker/BuildKit secret management;
- automatically convert runtime `env` into build arguments;
- automatically convert build arguments into runtime environment variables;
- create requisites from build-arg references;
- change Builder's Dockerfile target selection rules.

---

## 4. Schema Additions

### 4.1 `services.main.buildArgs`

`build.json` MUST allow:

```json
{
  "services": {
    "main": {
      "buildArgs": {
        "BASE_PATH": "/web",
        "NEXT_PUBLIC_API_URL": "http://localhost:3000/api"
      }
    }
  }
}
```

Conceptually:

```ts
type MainService = {
  env?: Record<string, string>;
  buildArgs?: Record<string, string>;
  endpoints?: Record<string, MainEndpoint>;
  requisites?: Requisites;
  "override-compose"?: string;
};
```

Every `buildArgs` value MUST be a string.

### 4.2 Build-stage `buildArgs`

Every build stage MUST allow `buildArgs` under `services.main`.

```json
{
  "prod": {
    "services": {
      "main": {
        "buildArgs": {
          "NODE_ENV": "production"
        }
      }
    }
  }
}
```

Valid build stages:

```text
dev
prod
test
e2e
```

### 4.3 Mesh base `buildArgs`

A sourced mesh service MUST allow `buildArgs` inside `extends.main`.

```json
{
  "services": {
    "frontend": {
      "source": "./services/frontend",
      "extends": {
        "main": {
          "buildArgs": {
            "BASE_PATH": "/web"
          }
        }
      }
    }
  }
}
```

### 4.4 Mesh-stage `buildArgs`

Mesh stages MUST allow:

```json
{
  "prod": {
    "services": {
      "frontend": {
        "extends": {
          "main": {
            "buildArgs": {
              "NEXT_PUBLIC_API_URL": "https://example.test/api"
            }
          }
        }
      }
    }
  }
}
```

Valid mesh stages:

```text
dev
prod
e2e
```

There is no mesh `test` stage.

---

## 5. Invalid Locations

`buildArgs` MUST be rejected anywhere other than `main`.

Invalid normal service:

```json
{
  "services": {
    "postgres": {
      "compose": "./postgres/docker-compose.yml",
      "buildArgs": {
        "FOO": "bar"
      }
    }
  }
}
```

Invalid tester:

```json
{
  "services": {
    "tester": {
      "compose": "./e2e/docker-compose.yml",
      "service": "e2e",
      "buildArgs": {
        "FOO": "bar"
      }
    }
  }
}
```

Invalid mesh override:

```json
{
  "services": {
    "backend": {
      "source": "./services/backend",
      "extends": {
        "postgres": {
          "buildArgs": {
            "FOO": "bar"
          }
        }
      }
    }
  }
}
```

---

## 6. Value Rules

### 6.1 Strings only

Valid:

```json
{
  "buildArgs": {
    "PORT": "3000",
    "DEBUG": "false"
  }
}
```

Invalid:

```json
{
  "buildArgs": {
    "PORT": 3000,
    "DEBUG": false
  }
}
```

### 6.2 Empty strings

Empty strings MAY be supplied intentionally and MUST be preserved.

```json
{
  "buildArgs": {
    "BASE_PATH": ""
  }
}
```

### 6.3 No implicit env conversion

This:

```env
# .env.prod
BASE_PATH=/web
```

MUST NOT implicitly create a Docker build arg.

The user must explicitly define:

```json
{
  "prod": {
    "services": {
      "main": {
        "buildArgs": {
          "BASE_PATH": "/web"
        }
      }
    }
  }
}
```

---

## 7. Reference Support

Build-arg values MAY contain normal Builder references.

```json
{
  "buildArgs": {
    "NEXT_PUBLIC_API_URL": "${gateway.source.main.endpoints.http.public_url}/api"
  }
}
```

All V3 reference rules apply:

- references never create requisites;
- the referenced service must already exist in the effective requisite scope;
- self-reference is allowed;
- public properties require effective publication;
- URL properties require a scheme;
- shadowed references are not validated;
- effective merging happens before reference validation.

---

## 8. Build-Arg Merge Semantics

`buildArgs` is an object, so normal V3 object merge semantics apply.

Base:

```json
{
  "buildArgs": {
    "A": "base",
    "B": "base"
  }
}
```

Stage:

```json
{
  "buildArgs": {
    "B": "prod",
    "C": "prod"
  }
}
```

Effective:

```json
{
  "buildArgs": {
    "A": "base",
    "B": "prod",
    "C": "prod"
  }
}
```

There is no special build-arg deletion sentinel in this feature.

---

## 9. Precedence

The build-arg precedence model follows the same structural authority ordering as runtime `env`, except `.env.<stage>` files do not participate.

All lists are low to high.

### 9.1 Standalone `dev`

```text
1. base services.main.buildArgs
2. dev.services.main.buildArgs
3. effective services.main.override-compose build args
4. Builder-owned build args, if any
```

### 9.2 Standalone `test`

```text
1. base services.main.buildArgs
2. test.services.main.buildArgs
3. effective services.main.override-compose build args
4. Builder-owned build args, if any
```

### 9.3 Standalone `prod`

```text
1. base services.main.buildArgs
2. prod.services.main.buildArgs
3. effective services.main.override-compose build args
4. Builder-owned build args, if any
```

### 9.4 Standalone E2E

E2E structured inheritance:

```text
base -> prod -> e2e
```

Precedence:

```text
1. base services.main.buildArgs
2. prod.services.main.buildArgs
3. e2e.services.main.buildArgs
4. effective services.main.override-compose build args after base -> prod -> e2e
5. Builder-owned build args, if any
```

`.env.prod` and `.env.e2e` do not participate in build args.

### 9.5 Mesh `dev`

```text
1. source base services.main.buildArgs
2. source dev.services.main.buildArgs
3. effective source services.main.override-compose build args
4. mesh base extends.main.buildArgs
5. mesh dev extends.main.buildArgs
6. Builder-owned build args, if any
```

### 9.6 Mesh `prod`

```text
1. source base services.main.buildArgs
2. source prod.services.main.buildArgs
3. effective source services.main.override-compose build args
4. mesh base extends.main.buildArgs
5. mesh prod extends.main.buildArgs
6. Builder-owned build args, if any
```

### 9.7 Mesh / global E2E

```text
1. source base services.main.buildArgs
2. source prod.services.main.buildArgs
3. source e2e.services.main.buildArgs
4. effective source services.main.override-compose build args
5. mesh base extends.main.buildArgs
6. mesh prod extends.main.buildArgs
7. mesh e2e extends.main.buildArgs
8. Builder-owned build args, if any
```

---

## 10. `override-compose` Interaction

`override-compose` remains supported and MAY define Docker/Compose build args.

Example:

```yaml
services:
  app:
    build:
      args:
        BASE_PATH: /from-compose
```

If Builder config contains:

```json
{
  "buildArgs": {
    "BASE_PATH": "/from-build-json"
  }
}
```

the standalone effective value is:

```text
BASE_PATH=/from-compose
```

because `override-compose` is higher precedence than source/base/stage `buildArgs`.

In mesh execution, mesh `extends.main.buildArgs` is higher precedence than source `override-compose` build args.

---

## 11. Builder-Owned Build Args

Builder MAY reserve or inject build args required for its own internal build mechanism.

Any Builder-owned build arg has highest precedence.

If a user explicitly defines a reserved Builder-owned key, Builder SHOULD fail with a clear validation error rather than silently ignore the user value.

---

## 12. Docker Build Integration

After effective configuration is merged and references are resolved, Builder MUST produce a single final map:

```ts
type EffectiveBuildArgs = Record<string, string>;
```

Builder MUST supply that map to the Docker build for `main`.

Conceptually equivalent to:

```bash
docker build   --build-arg BASE_PATH=/web   --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:3000/api
```

The implementation MAY use generated Compose configuration instead of direct CLI flags.

---

## 13. Compile Order

Conceptual feature pipeline:

```text
1. parse config
2. structural schema validation
3. apply build base + stage merges
4. apply mesh base + stage extends
5. compute effective structured buildArgs
6. merge effective override-compose build args
7. apply Builder-owned build args
8. validate only surviving references
9. resolve references
10. produce final build-arg map
11. build main image
12. materialize runtime
```

Key invariant:

> A build-arg reference shadowed by a higher-precedence value MUST NOT be resolved or rejected.

---

## 14. Shadowed Reference Example

Source:

```json
{
  "services": {
    "main": {
      "buildArgs": {
        "NEXT_PUBLIC_API_URL": "${backend.endpoints.http.public_url}"
      },
      "requisites": {
        "backend": "requirement"
      }
    }
  }
}
```

Mesh:

```json
{
  "services": {
    "frontend": {
      "source": "./services/frontend",
      "extends": {
        "main": {
          "requisites": {
            "source.backend": false,
            "gateway": "requirement"
          },
          "buildArgs": {
            "NEXT_PUBLIC_API_URL": "${gateway.source.main.endpoints.http.public_url}/api"
          }
        }
      }
    }
  }
}
```

The source value is shadowed. Builder MUST validate only the surviving mesh value.

---

## 15. Standalone Example

```json
{
  "name": "frontend",
  "services": {
    "main": {
      "buildArgs": {
        "BASE_PATH": "",
        "NEXT_PUBLIC_BACKEND_URL": "${backend.endpoints.http.public_url}"
      },
      "endpoints": {
        "http": {
          "port": 3000,
          "publicPort": 3000,
          "primary": true,
          "scheme": "http"
        }
      },
      "requisites": {
        "backend": "requirement"
      }
    },

    "tester": {
      "compose": "./services/tester/docker-compose.yml",
      "service": "frontend-e2e",
      "env": {
        "BASE_URL": "${main.endpoints.http.public_url}"
      }
    },

    "backend": {
      "compose": "./services/backend/docker-compose.mock.yml",
      "endpoints": {
        "http": {
          "service": "backend",
          "port": 3000,
          "publicPort": "AUTO",
          "primary": true,
          "scheme": "http"
        }
      }
    }
  },

  "dev": {
    "services": {
      "main": {
        "buildArgs": {
          "BASE_PATH": "/dev"
        }
      }
    }
  },

  "prod": {
    "services": {
      "main": {
        "buildArgs": {
          "BASE_PATH": "/web"
        }
      }
    }
  },

  "e2e": {
    "services": {
      "main": {
        "buildArgs": {
          "E2E_BUILD": "true"
        }
      }
    }
  }
}
```

---

## 16. Mesh Example

```json
{
  "name": "fullstack",

  "services": {
    "tester": {
      "compose": "./e2e/docker-compose.yml",
      "service": "global-e2e"
    },

    "frontend": {
      "source": "./services/frontend",

      "extends": {
        "main": {
          "requisites": {
            "source.backend": false,
            "gateway": "requirement"
          },

          "buildArgs": {
            "BASE_PATH": "/web",
            "NEXT_PUBLIC_BACKEND_URL": "${gateway.source.main.endpoints.http.public_url}/api"
          }
        }
      }
    },

    "gateway": {
      "source": "./services/gateway",
      "publish": [
        "main.endpoints.http"
      ]
    }
  },

  "prod": {
    "services": {
      "frontend": {
        "extends": {
          "main": {
            "buildArgs": {
              "BUILD_PROFILE": "production"
            }
          }
        }
      }
    }
  },

  "e2e": {
    "services": {
      "frontend": {
        "extends": {
          "main": {
            "buildArgs": {
              "BUILD_PROFILE": "e2e"
            }
          }
        }
      }
    }
  }
}
```

Global E2E effective frontend args include:

```text
BASE_PATH=/web
NEXT_PUBLIC_BACKEND_URL=<gateway public URL>/api
BUILD_PROFILE=e2e
```

---

## 17. Security

`buildArgs` MUST be documented as unsuitable for secrets.

Documentation SHOULD state:

> Docker build arguments may be observable through build metadata, image history, cache records, or the build process. Do not use `buildArgs` for secrets.

Secrets belong in an appropriate BuildKit/Compose secret mechanism, not this feature.

---

## 18. Schema Validation Requirements

The schema MUST accept:

- base `services.main.buildArgs`;
- build-stage `services.main.buildArgs`;
- mesh `extends.main.buildArgs`;
- mesh-stage `extends.main.buildArgs`.

It MUST reject:

- tester `buildArgs`;
- normal-service `buildArgs`;
- non-string values.

Semantic validation MUST enforce reference scope and effective precedence.

---

## 19. Error Requirements

Errors SHOULD report:

- source file;
- path;
- stage;
- composition context;
- offending key/reference;
- reason.

Example:

```text
buildArgs is only allowed on services.main
source=/project/build.json
path=services.postgres.buildArgs
stage=base
```

Example:

```text
buildArgs values must be strings
source=/project/build.json
path=services.main.buildArgs.PORT
received=number
```

---

## 20. Recommended Internal Types

```ts
export type BuildArgs = Record<string, string>;

export interface MainServiceConfig {
  env?: Record<string, string>;
  buildArgs?: BuildArgs;
  endpoints?: Record<string, MainEndpoint>;
  requisites?: Requisites;
  "override-compose"?: string;
}

export interface EffectiveMainConfig {
  env: Record<string, string>;
  buildArgs: Record<string, string>;
  endpoints: Record<string, EffectiveEndpoint>;
  requisites: EffectiveRequisites;
  overrideCompose?: string;
}
```

---

## 21. Required Test Coverage

### Schema tests

Verify:

- base main buildArgs accepted;
- dev/prod/test/e2e main buildArgs accepted;
- mesh base extends.main.buildArgs accepted;
- mesh stage extends.main.buildArgs accepted;
- tester buildArgs rejected;
- normal-service buildArgs rejected;
- non-string values rejected.

### Merge tests

Verify object key inheritance and overriding.

### Standalone precedence tests

Verify:

```text
base < stage < override-compose < Builder
```

for dev, test, and prod.

For E2E:

```text
base < prod < e2e < override-compose < Builder
```

### Mesh precedence tests

Dev/prod:

```text
source base
<
source stage
<
source override-compose
<
mesh base
<
mesh stage
<
Builder
```

E2E:

```text
source base
<
source prod
<
source e2e
<
source override-compose
<
mesh base
<
mesh prod
<
mesh e2e
<
Builder
```

### `.env` isolation tests

Verify values in all of:

```text
.env.dev
.env.prod
.env.test
.env.e2e
.env.e2e-tester
```

do not become build args unless explicitly repeated in `buildArgs`.

### Reference tests

Verify:

- self-reference;
- valid reference with requisite;
- invalid reference without requisite;
- invalid reference to pruned target;
- valid cross-source reference;
- public reference publication rules;
- shadowed invalid reference ignored;
- surviving invalid reference fails.

### Docker integration tests

Use a Dockerfile with:

```dockerfile
ARG TEST_VALUE
RUN test "$TEST_VALUE" = "expected"
```

and verify Builder passes the effective value.

### Override-compose integration tests

Verify source override-compose beats source structured buildArgs, while mesh `extends.main.buildArgs` beats source override-compose.

---

## 22. Acceptance Criteria

The feature is complete only when:

1. build.json supports first-class main buildArgs;
2. all build stages support them;
3. mesh base and stages support them through extends.main;
4. normal services reject them;
5. tester rejects them;
6. values are strings only;
7. `.env.<stage>` never contributes build args;
8. E2E inherits prod structured build args;
9. override-compose participates at the documented precedence point;
10. mesh build args beat source override-compose args;
11. references resolve after effective merging;
12. references never create requisites;
13. shadowed invalid references do not fail;
14. surviving invalid references fail;
15. final resolved args reach Docker;
16. Builder-owned args remain authoritative;
17. runtime `env` behavior remains unchanged;
18. documentation and exhaustive examples are updated.

---

## 23. Superseded Rule

The old rule:

> Build arguments are supplied only through `override-compose`.

is superseded.

The V3 rule is:

> `services.main.buildArgs` is a first-class Builder field in both build and mesh configuration. `override-compose` remains supported for advanced build configuration and participates in the documented precedence chain.

---

## 24. Canonical Mental Model

```text
runtime configuration
    -> env

Docker build-time configuration
    -> buildArgs

advanced Compose/Docker configuration
    -> override-compose
```

Build-arg precedence:

```text
source/base buildArgs
    ↓
source stage buildArgs
    ↓
source override-compose build args
    ↓
mesh base buildArgs
    ↓
mesh stage buildArgs
    ↓
Builder-owned build args
```

`.env.<stage>` is intentionally absent.

---

# End of Feature Specification