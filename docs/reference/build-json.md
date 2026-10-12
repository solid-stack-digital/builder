# `build.json` reference

`build.json` defines one service project. The document is strict: unknown fields and wrong types fail. Builder-managed environment values are strings only. Builder identifiers match `^[a-z][a-z0-9-]*$`; see [identifier rules](identifier-rules.md).

## Complete shape

```ts
type BuildJson = {
  $schema?: string;
  name?: string;
  dockerfile?: string;
  app: { env?: Record<string, string>; endpoints?: Record<string, AppEndpoint> };
  dependencies?: Record<string, DependencyConfig>;
  tester?: { env?: Record<string, string> };
  dev?: BuildStage; prod?: BuildStage; test?: BuildStage; e2e?: BuildStage;
};
```

`AppEndpoint` is `{ port: number; publicPort?: number | "AUTO"; primary?: boolean; scheme?: string }`. `DependencyEndpoint` adds required `service: string`. A build stage may contain `override-compose`, partial `app` fields, and partial dependency entries.

## Root fields

| Path | Type | Required? | Default / behavior |
|---|---|---:|---|
| `$schema` | string | No | Editor/schema tooling only. |
| `name` | string | No | Base service project name. Dev uses the base name; prod/test/e2e use stage-specific project names to separate resources. |
| `dockerfile` | string | No | Defaults to `Dockerfile`; relative to service project. |
| `app` | object | **Yes** | App contract; see below. |
| `dependencies` | object map | No | Logical local dependency contracts. |
| `tester` | object | No | Service-level E2E env configuration. |
| `dev` | stage object | No | Development overlay. |
| `prod` | stage object | No | Production overlay. |
| `test` | stage object | No | Unit-test overlay. |
| `e2e` | stage object | No | E2E runtime overlay. |

## App fields and endpoints

| Path | Type | Required? | Behavior and interaction |
|---|---|---:|---|
| `app.env` | string map | No | App runtime env; Builder references allowed; see [precedence](environment-precedence.md). Does not create build args. |
| `app.endpoints` | endpoint map | No | Empty is allowed; non-empty effective map requires exactly one primary. |
| `app.endpoints.<name>.port` | integer 1–65535 | Yes in base endpoint | Container/network port; primary endpoint sets Builder `PORT`. |
| `app.endpoints.<name>.publicPort` | integer 1–65535 or `"AUTO"` | No | Makes endpoint publishable; standalone publication differs from mesh. |
| `app.endpoints.<name>.primary` | boolean | Optional field; effective exactly-one rule | Omitted means false. Exactly one effective endpoint is primary in non-empty map. |
| `app.endpoints.<name>.scheme` | URI scheme string | No | Required only when resolving a URL property; syntax `^[A-Za-z][A-Za-z0-9+.-]*$`. |

Stage endpoint fields are partial overlays. A stage-added endpoint must have a complete effective `port` and the effective endpoint map must still have exactly one primary.

## Dependencies

| Path | Type | Required? | Behavior and interaction |
|---|---|---:|---|
| `dependencies.<name>` | object | No | `<name>` is a Builder identifier and is the logical dependency identity. |
| `dependencies.<name>.compose` | non-empty string path | **Yes** | Relative service-project path to one atomic Compose implementation. |
| `dependencies.<name>.env` | string map | No | Applied across every service in local implementation when materialized; references allowed; no readiness edge. |
| `dependencies.<name>.endpoints` | endpoint map | No | Absent/empty means inert and never materialized. Non-empty needs exactly one primary. |
| `dependencies.<name>.dependsOn` | string array | No | Entries use `dependencies.<target>`; stable-union merges with stage entries and creates health readiness ordering. |
| `dependencies.<dep>.endpoints.<name>.service` | non-empty string | **Yes** | Exact service key in dependency Compose; never inferred. |
| `dependencies.<dep>.endpoints.<name>.port` | integer 1–65535 | **Yes** | Container/network port on that owner. |
| `dependencies.<dep>.endpoints.<name>.publicPort` | integer or `"AUTO"` | No | Host-port intent; actual mesh publication also requires `publish`. |
| `dependencies.<dep>.endpoints.<name>.primary` | boolean | Optional field; effective exactly-one rule | Canonical endpoint metadata; does not choose an owner or readiness service. |
| `dependencies.<dep>.endpoints.<name>.scheme` | scheme string | No | Required for a URL reference. |

Dependency `dependsOn` targets must exist, be endpoint-bearing/materializable, and cannot form self references or cycles. A materialized dependency includes all services/resources in its Compose file. In mesh, binding the logical dependency suppresses this local implementation atomically.

## Tester

| Path | Type | Required? | Behavior |
|---|---|---:|---|
| `tester` | object | No | Service-level runner is Dockerfile target `test-e2e`. |
| `tester.env` | string map | No | Tester configuration; only `public_*` endpoint references are allowed and endpoints must be published during service E2E. |

## Stage fields

The supported JSON stage names are `dev`, `prod`, `test`, and `e2e`. Each stage object supports:

| Path pattern | Type | Required? | Behavior |
|---|---|---:|---|
| `<stage>.override-compose` | non-empty relative path | No | App-only Compose customization; see [override contract](override-compose-contract.md). |
| `<stage>.app` | object | No | Partial app overlay. |
| `<stage>.app.env` | string map | No | Keywise app env overlay. |
| `<stage>.app.endpoints` | endpoint map | No | Keywise partial endpoint overlay. |
| `<stage>.app.endpoints.<name>.port` | port integer | Optional in overlay | Replaces effective port; required if endpoint is new. |
| `<stage>.app.endpoints.<name>.publicPort` | port or `"AUTO"` | No | Replaces effective publication intent. |
| `<stage>.app.endpoints.<name>.primary` | boolean | No | Replaces effective primary marker. |
| `<stage>.app.endpoints.<name>.scheme` | scheme string | No | Replaces effective URL scheme. |
| `<stage>.dependencies` | object map | No | Adds/overlays logical dependencies. |
| `<stage>.dependencies.<name>.compose` | path string | Required for a newly added dependency | Replaces/sets implementation path. |
| `<stage>.dependencies.<name>.env` | string map | No | Keywise dependency env overlay. |
| `<stage>.dependencies.<name>.endpoints` | endpoint map | No | Adds/overlays endpoints; endpoint fields below are partial. |
| `<stage>.dependencies.<name>.endpoints.<endpoint>.service` | string | Required if newly added | Exact Compose service owner. |
| `<stage>.dependencies.<name>.endpoints.<endpoint>.port` | integer | Required if newly added | Internal port. |
| `<stage>.dependencies.<name>.endpoints.<endpoint>.publicPort` | port or `"AUTO"` | No | Publication intent. |
| `<stage>.dependencies.<name>.endpoints.<endpoint>.primary` | boolean | No | Effective endpoint primary marker. |
| `<stage>.dependencies.<name>.endpoints.<endpoint>.scheme` | scheme string | No | URL metadata. |
| `<stage>.dependencies.<name>.dependsOn` | string array | No | Stable union with base entries. |

For all four stages, the `<stage>` placeholder means exactly each of `dev`, `prod`, `test`, and `e2e`. Objects merge by key, scalars replace, omitted values inherit, and there is no deletion syntax. `test-unit` uses `test`; `test-e2e` uses `e2e`. E2E uses the `prod` image target but does not inherit prod runtime env.

## Complete example

```json
{
  "$schema": "../schemas/build-schema.json",
  "name": "frontend",
  "dockerfile": "Dockerfile",
  "app": {
    "env": { "API_URL": "${dependencies.backend.endpoints.http.network_url}", "CACHE_HOST": "${dependencies.redis.endpoints.redis.network_host}" },
    "endpoints": {
      "http": { "port": 3000, "publicPort": "AUTO", "primary": true, "scheme": "http" },
      "metrics": { "port": 9090, "scheme": "http" }
    }
  },
  "dependencies": {
    "backend": {
      "compose": "dependencies/backend-mock.yml",
      "env": { "MOCK_MODE": "true" },
      "endpoints": { "http": { "service": "mock-api", "port": 8080, "primary": true, "scheme": "http" } }
    },
    "redis": {
      "compose": "dependencies/redis.yml",
      "env": { "ALLOW_EMPTY_PASSWORD": "yes" },
      "endpoints": { "redis": { "service": "cache", "port": 6379, "primary": true, "scheme": "redis" } }
    },
    "realtime": {
      "compose": "dependencies/realtime.yml",
      "endpoints": { "ws": { "service": "realtime", "port": 8080, "primary": true, "scheme": "ws" } },
      "dependsOn": ["dependencies.redis"]
    }
  },
  "tester": { "env": { "BASE_URL": "${app.endpoints.http.public_url}" } },
  "dev": {
    "override-compose": "compose/dev.yml",
    "app": { "env": { "LOG_LEVEL": "debug" }, "endpoints": { "http": { "port": 3000, "publicPort": "AUTO", "primary": true, "scheme": "http" } } }
  },
  "prod": { "app": { "env": { "LOG_LEVEL": "info" } } },
  "test": { "app": { "env": { "FIXTURES": "test-data" } } },
  "e2e": {
    "app": { "env": { "LOG_LEVEL": "test" } },
    "dependencies": {
      "mailpit": {
        "compose": "dependencies/mailpit.yml",
        "env": { "MP_MAX_MESSAGES": "1000" },
        "endpoints": {
          "smtp": { "service": "mailpit", "port": 1025, "primary": true, "scheme": "smtp" },
          "http": { "service": "mailpit", "port": 8025, "publicPort": "AUTO", "scheme": "http" }
        },
        "dependsOn": ["dependencies.redis"]
      }
    }
  }
}
```

This example requires the referenced Compose files and Dockerfile targets to exist. The `backend` dependency also demonstrates why a mesh binding can replace a local mock without changing app references.

## Related

- [Service quickstart](../getting-started/service-quickstart.md)
- [Dependency Compose contract](dependency-compose-contract.md)
- [Stage matrix](stage-matrix.md)
