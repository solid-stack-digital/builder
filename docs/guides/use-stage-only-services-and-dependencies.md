# Add services or dependencies for one stage

Build overlays can add a dependency under `e2e.dependencies`. The effective dependency still needs a Compose path and complete endpoint fields if it has endpoints. Mesh overlays can add a top-level service under `e2e.services`; its effective `path` is required.

E2E inherits `prod` structured configuration before applying its own overlay. A service or dependency added only in `prod` is therefore present in E2E unless replaced by later scalar/map values. A service or dependency added only in E2E is present only in E2E. Inherited dependency `compose` implementations are immutable; a later stage cannot replace the implementation. A stage-added dependency may define its own `compose`.

Stage-only mesh services participate in the global Phase 2 E2E mesh when effective. Phase 1 of canonical `mesh test` iterates root `mesh.json.services` only, so stage-only services are not Phase-1 members unless they also exist at the root.

Example: define a fake payment provider only in `mesh.e2e.services`, then bind the consumer's `payments-api` slot to `fake-payments` only in `mesh.e2e.services.frontend.dependencies`. A stage-added provider must expose the app endpoint names the consumer actually references.

There is no deletion syntax. See [stages](../concepts/stages.md) and the [mesh reference](../reference/mesh-json.md).

## Related

- [Bind dependencies](bind-dependencies-to-real-services.md)
- [Stage matrix](../reference/stage-matrix.md)
- [build.json](../reference/build-json.md)
