# Publish one gateway and keep the mesh private

Give only the gateway an endpoint `publicPort` in its service build config. Then select only that endpoint in the mesh:

```json
{
  "services": {
    "frontend": { "path": "./services/frontend", "publish": [] },
    "backend": { "path": "./services/backend", "publish": [] },
    "gateway": { "path": "./services/gateway", "dependsOn": ["frontend", "backend"], "publish": ["app.endpoints.http"] }
  }
}
```

Gateway env can use `${frontend.app.endpoints.http.network_url}` and `${backend.app.endpoints.http.network_url}`. Publish does not create readiness; `dependsOn` does. See [publication](../concepts/publication-and-ports.md).

## Related

- [Publish mesh endpoints](../guides/publish-mesh-endpoints.md)
- [Composition-owned wiring](composition-owned-gateway-wiring.md)
- [mesh.json](../reference/mesh-json.md)
