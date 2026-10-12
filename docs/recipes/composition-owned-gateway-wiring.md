# Put gateway wiring in mesh configuration

Composition-specific URLs belong in mesh service `env`:

```json
{
  "services": {
    "frontend": { "path": "./services/frontend" },
    "backend": { "path": "./services/backend" },
    "gateway": {
      "path": "./services/gateway",
      "env": {
        "FRONTEND_URL": "${frontend.app.endpoints.http.network_url}",
        "BACKEND_URL": "${backend.app.endpoints.http.network_url}"
      },
      "dependsOn": ["frontend", "backend"]
    }
  }
}
```

The references supply values; explicit `dependsOn` supplies readiness. Add `publish: ["app.endpoints.http"]` to gateway only if its endpoint has `publicPort` and host access is needed.

## Related

- [Build a mesh](../guides/build-a-mesh.md)
- [Lifecycle and readiness](../concepts/lifecycle-and-readiness.md)
- [Public gateway recipe](public-gateway-private-services.md)
