# `mesh.json` reference

`mesh.json` composes independently runnable service projects. It owns bindings, cross-service environment, top-level readiness, host publication, and the global E2E tester. Mesh endpoint declarations remain in each service's `build.json`.

## Complete shape

```ts
type MeshJson = {
  $schema?: string; name?: string;
  tester?: { compose: string; service: string; env?: Record<string, string> };
  services: Record<string, MeshService>;
  dev?: MeshStage; prod?: MeshStage; e2e?: MeshStage;
};
type MeshService = {
  path: string; env?: Record<string, string>; dependencies?: Record<string, string>;
  dependsOn?: string[]; publish?: string[];
};
```

`mesh.json` supports `dev`, `prod`, and `e2e` overlays only. A root `test` field is rejected, including an empty object and when `--skip-checks` is used. `build.json.test` remains supported. See [v2.2 migration](../migration/v2.1-to-v2.2.md).

## Root fields

| Path | Type | Required? | Behavior |
|---|---|---:|---|
| `$schema` | string | No | Editor/schema tooling. |
| `name` | string | No | Base mesh project identity; runtime stages use separate Compose project identities to keep resources distinct. |
| `tester` | object | No generally | Required for global E2E and `mesh up test`; `mesh check --require-tester` enforces it. |
| `services` | service map | **Yes** | Must contain at least one root service; each effective service needs a path. Stage additions do not satisfy the root minimum. |
| `dev`, `prod`, `e2e` | stage object | No | Stage-specific service overlays only. |

## Base mesh service fields

| Path | Type | Required? | Behavior and interaction |
|---|---|---:|---|
| `services.<name>.path` | relative project path | **Yes** | Points from mesh project to service project. Stage-added services need effective path. |
| `services.<name>.env` | string map | No | Composition-owned app env; supports direct mesh refs; higher precedence than service env; does not create readiness. |
| `services.<name>.dependencies` | string map | No | Key is consumer logical dependency, value is provider mesh service key. Binding suppresses local implementation and creates readiness edge. |
| `services.<name>.dependsOn` | string array | No | Explicit top-level readiness targets; stable-union stage merge; missing/self/cycles fail. |
| `services.<name>.publish` | string array | No | Selects publishable endpoint paths; stable-union stage merge; mesh is private by default. |

Binding keys must exist in the consumer's effective build dependencies; provider values must name effective top-level services. Consumer references retain the logical dependency path and resolve through provider app endpoints with matching endpoint names. There is no endpoint remapping syntax.

`publish` accepts exactly `app.endpoints.<endpoint>` and `dependencies.<dependency>.endpoints.<endpoint>`. Target must have `publicPort`. Substituted local dependency endpoints cannot be published through the consumer; publish the provider app endpoint.

## Root tester

| Path | Type | Required? | Behavior |
|---|---|---:|---|
| `tester.compose` | relative path string | Required when tester exists | Global tester Compose file; may contain helper services. |
| `tester.service` | non-empty string | Required when tester exists | Exact runner service key; Builder does not select the first service. |
| `tester.env` | string map | No | Applied to selected runner; mesh refs allowed but only `public_*` endpoint properties. |

The selected tester runner is a host-side E2E client. It uses root `.env.e2e-tester`, gets `EXEC_MODE=e2e`, and receives no `INFRA_MODE`; services it needs must be effectively published. Helper services in the tester Compose file are retained.

## Stage overlays

Each root stage (`dev`, `prod`, `e2e`) contains only `services`. Each `<stage>.services.<name>` supports:

| Path | Type | Required? | Merge behavior |
|---|---|---:|---|
| `<stage>.services` | map | No | Adds/overlays service entries. |
| `<stage>.services.<name>.path` | relative path | Required for a new service | Scalar replaces base path. |
| `<stage>.services.<name>.env` | string map | No | Keywise merge; stage provider wins same key. |
| `<stage>.services.<name>.dependencies` | string map | No | Keywise merge; stage provider wins same logical slot. |
| `<stage>.services.<name>.dependsOn` | string array | No | Stable union, base order then stage order. |
| `<stage>.services.<name>.publish` | string array | No | Stable union, base order then stage order. |

No deletion syntax exists. Every active binding, reference, dependency path, readiness edge, and publication is validated against effective stage configuration. Inheritance is `dev=base->dev`, `prod=base->prod`, and `e2e=base->prod->e2e`; mesh env, paths, bindings, dependencies, lifecycle edges, and publications inherit in that order.

## Complete example

The example assumes independently runnable service projects nested under the mesh project directory (`./services/<name>`):

```text
mesh-project/
  mesh.json
  services/
    frontend/
    backend/
    gateway/
    fake-payments/
```

```json
{
  "$schema": "../schemas/mesh-schema.json",
  "name": "shop-system",
  "tester": { "compose": "e2e/tester.yml", "service": "runner", "env": { "GATEWAY_URL": "${gateway.app.endpoints.http.public_url}" } },
  "services": {
    "frontend": {
      "path": "./services/frontend",
      "env": { "BACKEND_URL": "${frontend.dependencies.backend.endpoints.http.network_url}" },
      "dependencies": { "backend": "backend" },
      "publish": []
    },
    "backend": { "path": "./services/backend", "publish": [] },
    "gateway": {
      "path": "./services/gateway",
      "env": { "FRONTEND_URL": "${frontend.app.endpoints.http.network_url}", "BACKEND_URL": "${backend.app.endpoints.http.network_url}" },
      "dependsOn": ["frontend", "backend"],
      "publish": ["app.endpoints.http"]
    }
  },
  "dev": { "services": { "gateway": { "env": { "LOG_LEVEL": "debug" } } } },
  "prod": { "services": { "gateway": { "env": { "LOG_LEVEL": "info" } } } },
  "e2e": {
    "services": {
      "fake-payments": { "path": "./services/fake-payments", "publish": ["app.endpoints.http"] },
      "frontend": { "dependencies": { "payments-api": "fake-payments" } }
    }
  }
}
```

Gateway waits for frontend and backend; frontend's backend binding supplies its own provider readiness. Neither service waits for gateway.

The example assumes the corresponding service projects declare the listed logical dependencies/endpoints. The E2E-only provider must have a valid path and a publishable `http` endpoint; frontend must declare `payments-api` in its effective build configuration. The provider's `publish` overlay is added only in E2E.

## Related

- [Mesh quickstart](../getting-started/mesh-quickstart.md)
- [Dependency substitution](../concepts/dependency-substitution.md)
- [Publish mesh endpoints](../guides/publish-mesh-endpoints.md)
