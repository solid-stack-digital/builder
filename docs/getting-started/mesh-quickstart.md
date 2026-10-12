# Compose a two-service mesh

Assume independent `frontend` and `backend` service projects nested under the mesh project directory:

```text
mesh-project/
  mesh.json
  services/
    frontend/
      build.json
      Dockerfile
    backend/
      build.json
      Dockerfile
```

These are independently runnable service projects whose directories are nested under the mesh project. Frontend's `build.json` declares a logical dependency named `backend` with an endpoint `http`; it may use a local mock Compose implementation when run alone.

Create a mesh project `mesh.json`:

```json
{
  "services": {
    "frontend": { "path": "./services/frontend", "dependencies": { "backend": "backend" } },
    "backend": { "path": "./services/backend", "publish": [] }
  }
}
```

The left binding key is the logical dependency slot in frontend's build config; the right value is the top-level provider service key. The binding suppresses frontend's local backend implementation atomically. Frontend code keeps using the logical dependency endpoint reference, which resolves through backend's app endpoint of the same name.

To expose a browser-facing frontend endpoint, ensure its `build.json` endpoint has `publicPort`, then set frontend `publish` to `app.endpoints.http`. Meshes are private by default.

```bash
builder mesh check
builder mesh up dev
builder mesh down dev
```

Read about [substitution](../concepts/dependency-substitution.md), [publication](../concepts/publication-and-ports.md), [mesh fields](../reference/mesh-json.md), and the [mesh guide](../guides/build-a-mesh.md).

## Related

- [Service and mesh model](../concepts/service-and-mesh-model.md)
- [Build a mesh](../guides/build-a-mesh.md)
- [mesh.json](../reference/mesh-json.md)
