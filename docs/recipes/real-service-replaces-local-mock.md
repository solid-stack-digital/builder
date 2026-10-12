# Replace a local mock with a real service

Frontend declares logical dependency `backend` and references `${dependencies.backend.endpoints.http.network_url}`. Its local mock Compose file keeps standalone development self-contained. In the mesh, bind `frontend.dependencies.backend` to top-level provider `backend`:

```json
{
  "services": {
    "frontend": { "path": "../frontend", "dependencies": { "backend": "backend" } },
    "backend": { "path": "../backend" }
  }
}
```

The mock is suppressed atomically; frontend configuration and code remain unchanged. Provider needs endpoint `http` if that name is referenced. See [dependency substitution](../concepts/dependency-substitution.md).

## Related

- [Bind dependencies guide](../guides/bind-dependencies-to-real-services.md)
- [Local dependencies](../concepts/local-dependencies.md)
- [mesh.json](../reference/mesh-json.md)
