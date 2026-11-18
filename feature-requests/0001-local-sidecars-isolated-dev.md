# Feature request: local sidecars in isolated `service up dev`

**For:** `@solid-stack/builder` maintainers
**From:** Yipsy (`yipsy-io`), currently pinned to builder `3.1.0`
**Ask:** let a service opt specific ordinary modules into isolated runs, so `builder service up dev` can start a small local helper container (for example a dev database) without switching the main service to `INFRA_MODE=integrated`.

## Problem

Our frontend is developed standalone with `builder service up dev` (isolated). In isolated mode the frontend uses in-process mock adapters instead of the real backend, which is the point of isolated dev: no backend, database or mail stack to run.

Those mock adapters must keep the data a developer creates across restarts. Today they persist it in browser `localStorage`, which has a per-origin quota of about 5 MB. Real curricula exceed it: saves fail with `QuotaExceededError` and work is lost. We want to replace `localStorage` with a tiny SQLite server running in its own container beside `main` in isolated dev.

Builder 3.1.0 has no way to start that container:

| Mechanism | Why it does not work |
|---|---|
| Ordinary service + `requisites` edge from `main` | Isolated mode activates only roots and drops every edge (`src/core/config/serviceGraph.ts`, `selectReachableGraph`: `if (profile.infraMode === "isolated") for (const root of declared.roots) active.add(root)`, and `edges = []`). The module stays dormant. |
| `builder service up dev --full` | Starts requisites, but also sets `INFRA_MODE=integrated` for `main` (`src/core/config/executionProfile.ts`). The frontend then switches to real backend adapters, which defeats isolated dev. |
| `services.main.override-compose` | The override may contain only `services.main`, not extra services (`docs/reference/override-compose-contract.md`). |
| A second process inside the `main` container | Works, but it is not a separate container and mixes the dev database's lifecycle, health and logs into `main`. |

The gap: builder treats every ordinary module as an *external dependency* that isolated mode must exclude. Some modules are *local tooling* that isolated mode should include.

## Proposal

Let an ordinary service declare that it runs in isolated mode. Any active node reaching it through a requisite edge then starts it, exactly as `--full` would, and `main` keeps `INFRA_MODE=isolated`.

```json
{
  "name": "fullstack-frontend",
  "services": {
    "main": {
      "endpoints": { "http": { "port": 3000, "publicPort": 3000, "primary": true, "scheme": "http" } },
      "requisites": { "backend": "dependency", "devstore": "dependency" },
      "env": { "DEV_STORE_URL": "${devstore.endpoints.http.network_url}" }
    },
    "devstore": {
      "compose": ".docker/devstore/docker-compose.devstore.yml",
      "isolated": true,
      "endpoints": { "http": { "service": "devstore", "port": 3002, "primary": true, "scheme": "http" } }
    },
    "backend": { "compose": ".docker/mocks/backend/docker-compose.backend.yml", "endpoints": { "...": "..." } },
    "tester": { "compose": "./e2e/docker-compose.yml", "service": "e2e-runner" }
  },
  "prod": { "services": { "main": { "requisites": { "devstore": false } } } }
}
```

The field name `isolated` is a suggestion; `infra: "local"` or `runIn: ["isolated", "integrated"]` would work as well.

### Semantics

1. **Field.** `services.<ordinary>.isolated: boolean`, default `false`, overridable per stage like other ordinary-service fields.
2. **Isolated graph.** In isolated mode the active set becomes: roots, plus the closure over edges whose target has `isolated: true`, starting from active nodes. Edges to `isolated: false` targets are still dropped, so `backend` stays dormant in isolated dev as today.
3. **Ordering and health.** Kept edges behave as in integrated mode: `dependency` waits for health, `prerequisite` waits for exit 0, `requirement` includes without ordering. Today isolated mode has no edges at all, so this is new for isolated runs only.
4. **Endpoint references.** `${devstore.endpoints.*}` in `main` values resolves in isolated mode when `devstore` is active. Today the docs say to keep external endpoint references out of isolated values; that rule would apply only to inactive targets.
5. **Unaffected.** `INFRA_MODE` and `EXEC_MODE` for `main` are unchanged in every workflow. Integrated workflows (`--full`, `prod`, `test-e2e`, mesh) are unchanged. They already include the module whenever an edge reaches it, and authors remove it per stage with `"devstore": false`.
6. **Unit tests.** `service up test-unit` is isolated too, so it would start reachable isolated modules. That is consistent, and authors who do not want that can set `test.services.main.requisites.devstore: false`.

## Acceptance criteria

- With the config above, `builder service up dev` starts `main` and `devstore` (not `backend`), waits for `devstore` health before `main`, and passes `INFRA_MODE=isolated` to `main`.
- `${devstore.endpoints.http.network_url}` resolves in that run.
- `builder service up dev --full` starts `main`, `devstore` and `backend`, with `INFRA_MODE=integrated`.
- `builder service up prod` with the `prod` overlay removing the edge starts no `devstore`.
- A config without any `isolated` field produces byte-identical compositions to 3.1.0.
- `builder check` rejects `isolated` on `main` or `tester`, and accepts it in stage overlays.
- In a mesh, a source's isolated-mode behavior is not affected (mesh runs are integrated).

## Compatibility

Purely additive and opt-in, so a minor release (for example `3.2.0`) fits. Yipsy pins builder to an exact version (`@solid-stack/builder` `3.1.0`), so we will bump the pin when the release is available.

## Context for prioritising

This blocks moving every Yipsy isolated mock adapter off `localStorage`, which is our fix for lost dev data. A workaround exists (a second process inside `main`), but it gives up container isolation, which is why we prefer to wait for this feature.
