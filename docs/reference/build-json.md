# `build.json` reference (V3)

A complete file requires `name`, `services.main`, and `services.tester`. Other `services` entries are ordinary Compose modules. Unknown fields fail validation. See the [complete docs-service fixture](../examples/docs-service/build.json) and [migration guide](../migration/v2.2-to-v3.0.md).

| Location | Allowed fields | Meaning |
|---|---|---|
| root | `$schema`, `name`, `services`, `dev`, `prod`, `test`, `e2e` | `name` is required. |
| `services.main` | `env`, `endpoints`, `requisites`, `override-compose` | Builder builds the canonical project Dockerfile. |
| `services.<ordinary>` | `compose`, `service`, `env`, `endpoints`, `requisites` | `compose` is required; endpoint-less modules need `service`. |
| `services.tester` | `compose`, `service`, `env` | Both `compose` and selected runner `service` are required. |
| `<stage>.services.<name>` | Partial service overlay | Existing fields merge recursively; arrays and scalars replace; `false` removes a requisite. |

The main endpoint has `port`, optional `publicPort`, `primary`, and `scheme`. Ordinary endpoints also require their owning Compose `service`. Exactly one endpoint is primary when endpoints exist. A service declaration alone does not start a module: add a `requisites` edge from `main` or another reachable ordinary service. `requirement` includes without ordering, `dependency` waits for health, and `prerequisite` waits for exit 0. No edge may target `tester`.

`dev`, `prod`, `test`, and `e2e` are configuration overlays. E2E inherits the structured `prod` overlay before its own overlay. The main Dockerfile targets are `dev`, `test`, and `prod`; an E2E run uses `prod`. The main override path belongs under `services.main.override-compose` or its selected stage overlay. Paths in a source file resolve from that source's directory.

```json
{
  "name": "example-api",
  "services": {
    "main": {
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
  "prod": { "services": { "main": { "env": { "DATABASE_HOST": "${db.endpoints.tcp.network_host}" } } } }
}
```

This is a complete configuration file; its `compose/db.yml`, `e2e/docker-compose.yml`, and project Dockerfile must also exist. Keep external endpoint references out of isolated base/dev/test values unless an active path makes them valid.
