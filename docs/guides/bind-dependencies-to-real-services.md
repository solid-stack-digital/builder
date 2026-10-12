# Bind a logical dependency to a real service

Suppose frontend's build config declares `dependencies.backend` and a local mock Compose file. In a mesh, bind that slot to the real backend service:

```json
{
  "services": {
    "frontend": { "path": "./services/frontend", "dependencies": { "backend": "backend" } },
    "backend": { "path": "./services/backend" }
  }
}
```

The build config and app references do not change. Builder suppresses the local backend implementation as a whole and resolves frontend's `dependencies.backend.endpoints.http` through `backend.app.endpoints.http`. The provider must have every endpoint name actually referenced by the consumer. Provider ports may differ; there is no endpoint remapping.

Different logical/provider names work: `"dependencies": { "payments-api": "fake-payments" }`. Stage overlays can change a provider, for example `e2e.services.frontend.dependencies.payments-api = fake-payments`. A binding creates consumer-to-provider readiness automatically; use explicit `dependsOn` for other relationships.

## Related

- [Dependency substitution](../concepts/dependency-substitution.md)
- [Stage-only services](use-stage-only-services-and-dependencies.md)
- [mesh.json](../reference/mesh-json.md)
