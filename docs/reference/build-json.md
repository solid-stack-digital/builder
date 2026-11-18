# `build.json` reference (V3)

A complete file requires `name`, `services.main`, and `services.tester`. Other `services` entries are ordinary Compose modules. Unknown fields fail validation. See the [complete docs-service fixture](../examples/docs-service/build.json) and [migration guide](../migration/v2.2-to-v3.0.md).

| Location | Allowed fields | Meaning |
|---|---|---|
| root | `$schema`, `name`, `services`, `dev`, `prod`, `test`, `e2e` | `name` is required. |
| `services.main` | `env`, `buildArgs`, `endpoints`, `requisites`, `override-compose` | Builder builds the canonical project Dockerfile. |
| `services.<ordinary>` | `compose`, `service`, `env`, `endpoints`, `requisites` | `compose` is required; endpoint-less modules need `service`. |
| `services.tester` | `compose`, `service`, `env` | Both `compose` and selected runner `service` are required. |
| `<stage>.services.<name>` | Partial service overlay | Existing fields merge recursively; arrays and scalars replace; `false` removes a requisite. |
| `dev.on-inframode-isolated.services.<name>`, `test.on-inframode-isolated.services.<name>` | Partial `main` or ordinary overlay; no `tester` | Applied after the stage overlay, only in isolated runs. See [isolated-only configuration](#isolated-only-configuration). |

The main endpoint has `port`, optional `publicPort`, `primary`, and `scheme`. Ordinary endpoints also require their owning Compose `service`. Exactly one endpoint is primary when endpoints exist. A service declaration alone does not start a module: add a `requisites` edge from `main` or another reachable ordinary service. `requirement` includes without ordering, `dependency` waits for health, and `prerequisite` waits for exit 0. No edge may target `tester`.

`dev`, `prod`, `test`, and `e2e` are configuration overlays. E2E inherits the structured `prod` overlay before its own overlay. The main Dockerfile targets are `dev`, `test`, and `prod`; an E2E run uses `prod`. The main override path belongs under `services.main.override-compose` or its selected stage overlay. Paths in a source file resolve from that source's directory.

`services.main.buildArgs` and `<stage>.services.main.buildArgs` contain string-to-string Docker build arguments. Stage keys merge with base keys; an empty string is retained. Values can use Builder endpoint references, subject to the same requisite and publication rules as `env`. `.env.<stage>` contributes only runtime environment variables, never build arguments. Ordinary services and the tester cannot declare `buildArgs`. Keys beginning `BUILDER_` are reserved. **Do not put secrets in build arguments:** Docker build metadata, image history, caches, and build logs may expose them. Use build secrets or runtime environment variables for secrets.

```json
{
  "name": "example-api",
  "services": {
    "main": {
      "buildArgs": { "BASE_PATH": "/api" },
      "endpoints": { "http": { "port": 3000, "publicPort": "AUTO", "primary": true, "scheme": "http" } },
      "requisites": { "db": "dependency" }
    },
    "db": {
      "compose": "./compose/db.yml",
      "service": "db",
      "endpoints": { "tcp": { "service": "db", "port": 5432, "primary": true } }
    },
    "tester": { "compose": "./e2e/docker-compose.yml", "service": "runner", "env": { "API_URL": "${main.endpoints.http.public_url}" } }
  },
  "prod": { "services": { "main": { "buildArgs": { "BUILD_MODE": "production" }, "env": { "DATABASE_HOST": "${db.endpoints.tcp.network_host}" } } } }
}
```

This is a complete configuration file; its `compose/db.yml`, `e2e/docker-compose.yml`, and project Dockerfile must also exist. Keep external endpoint references out of isolated base/dev/test values unless an active path makes them valid; put references to isolated-only modules inside `on-inframode-isolated`.

## Isolated-only configuration

`dev` and `test` may contain `on-inframode-isolated`, an overlay with the same `services` shape as a stage overlay, without `tester`. Builder merges it after the stage overlay, and only when the run is isolated: `service up dev` without `--full`, `service up test-unit`, and the unit phase of `service up test` and `mesh up test` Phase 1. In an isolated run, `main`'s requisites come only from this block; base and stage edges of `main` are still dropped. Modules it activates follow their own requisites, wait as usual, and `main` keeps `INFRA_MODE=isolated`. Integrated runs ignore the block, so a module reached only from it never starts there.

```json
{
  "name": "example-web",
  "services": {
    "main": {
      "endpoints": { "http": { "port": 3000, "publicPort": 3000, "primary": true, "scheme": "http" } },
      "requisites": { "backend": "dependency" }
    },
    "backend": {
      "compose": "./compose/backend.yml",
      "endpoints": { "http": { "service": "backend", "port": 4000, "primary": true, "scheme": "http" } }
    },
    "devstore": {
      "compose": "./compose/devstore.yml",
      "endpoints": { "http": { "service": "devstore", "port": 3002, "primary": true, "scheme": "http" } }
    },
    "tester": { "compose": "./e2e/docker-compose.yml", "service": "runner" }
  },
  "dev": {
    "on-inframode-isolated": {
      "services": {
        "main": {
          "requisites": { "devstore": "dependency" },
          "env": { "DEV_STORE_URL": "${devstore.endpoints.http.network_url}" }
        }
      }
    }
  }
}
```

`builder service up dev` starts `main` and `devstore`; `--full`, `prod`, and E2E start `main` and `backend`. See the [3.1 to 3.2 migration guide](../migration/v3.1-to-v3.2.md).
