# Replace a local dependency with a mesh provider

A binding maps a consumer's logical dependency slot to an existing top-level mesh service:

```json
{
  "services": {
    "frontend": { "path": "../frontend", "dependencies": { "backend": "backend" } },
    "backend": { "path": "../backend" }
  }
}
```

The key `backend` on the left must exist in the consumer's effective `build.json.dependencies`; the value must name an effective mesh service. The binding suppresses the local dependency's complete Compose implementation, including its services and resources. The consumer continues to reference `dependencies.backend.endpoints.<name>`; Builder resolves that through the provider's app endpoint of the same name.

Endpoint names must match when referenced. There is no endpoint remapping syntax. Provider container and public ports may differ from the local implementation because app code consumes the resolved endpoint contract. A binding adds consumer-to-provider readiness ordering; explicit `dependsOn` expresses additional top-level ordering.

For example, if the consumer references `dependencies.payments-api.endpoints.http.network_url`, the provider must expose app endpoint `http`. A provider with only endpoint `api` is invalid for that reference.

## Related

- [Bind dependencies to real services](../guides/bind-dependencies-to-real-services.md)
- [Dependency substitution recipe](../recipes/real-service-replaces-local-mock.md)
- [mesh.json reference](../reference/mesh-json.md)
