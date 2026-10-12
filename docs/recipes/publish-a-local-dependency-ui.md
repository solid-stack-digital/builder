# Publish a local dependency's admin UI

Declare Mailpit endpoints explicitly in the service project:

```json
{
  "dependencies": {
    "mailpit": {
      "compose": "dependencies/mailpit.yml",
      "endpoints": {
        "smtp": { "service": "mailpit", "port": 1025, "primary": true, "scheme": "smtp" },
        "http": { "service": "mailpit", "port": 8025, "publicPort": "AUTO", "scheme": "http" }
      }
    }
  }
}
```

Keep the dependency local/unsubstituted in the mesh and select `dependencies.mailpit.endpoints.http` in the consumer service's `publish` list. A dependency with no endpoint owner healthcheck is invalid for integrated use. See [dependency Compose contract](../reference/dependency-compose-contract.md).

## Related

- [Publication guide](../guides/publish-mesh-endpoints.md)
- [Endpoint properties](../reference/endpoint-properties.md)
- [Local dependencies](../concepts/local-dependencies.md)
