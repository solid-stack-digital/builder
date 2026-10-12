# Build a mesh

Create a mesh project with a `mesh.json` listing independently runnable service projects. Each effective service needs a `path` relative to the mesh project. The service key is its authoritative identity in this composition.

Add service `env` for composition-owned app values, dependency bindings for providers, `dependsOn` for explicit top-level readiness, and `publish` for host exposure. Direct mesh references use `${backend.app.endpoints.http.network_url}`; there is no `services.` prefix. Environment references do not add readiness edges.

```bash
builder mesh check
builder mesh up dev
builder mesh down dev
```

Mesh endpoint declarations stay in service build configs. See [service/mesh responsibilities](../concepts/service-and-mesh-model.md), [mesh reference](../reference/mesh-json.md), [bindings](bind-dependencies-to-real-services.md), and [publication](publish-mesh-endpoints.md).

## Related

- [Mesh quickstart](../getting-started/mesh-quickstart.md)
- [Dependency substitution](../concepts/dependency-substitution.md)
- [mesh.json](../reference/mesh-json.md)
