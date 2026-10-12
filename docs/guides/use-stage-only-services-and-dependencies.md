# Add services or dependencies for one stage

Build overlays can add a dependency under `e2e.dependencies`. The effective dependency still needs a Compose path and complete endpoint fields if it has endpoints. Mesh overlays can add a top-level service under `e2e.services`; its effective `path` is required.

Example: define a fake payment provider only in `mesh.e2e.services`, then bind the consumer's `payments-api` slot to `fake-payments` only in `mesh.e2e.services.frontend.dependencies`. It is absent from dev/prod. A stage-added provider must expose the app endpoint names the consumer actually references.

There is no deletion syntax. Stage objects add/replace values according to the documented merge rules; omitted values inherit. See [stages](../concepts/stages.md) and the [mesh reference](../reference/mesh-json.md).

## Related

- [Bind dependencies](bind-dependencies-to-real-services.md)
- [Stage matrix](../reference/stage-matrix.md)
- [build.json](../reference/build-json.md)
