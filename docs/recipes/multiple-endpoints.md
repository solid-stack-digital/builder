# Define multiple app and dependency endpoints

An app can declare HTTP as primary and metrics as secondary:

```json
{
  "app": { "endpoints": {
    "http": { "port": 3000, "publicPort": "AUTO", "primary": true, "scheme": "http" },
    "metrics": { "port": 9090, "scheme": "http" }
  } }
}
```

A dependency can expose API and admin UI on separate owners; each endpoint has explicit `service`, internal `port`, and optional publication metadata. Use `network_url` for service-to-service access and public properties only from host-side testers. See [endpoint properties](../reference/endpoint-properties.md).

## Related

- [Endpoints](../concepts/endpoints.md)
- [build.json](../reference/build-json.md)
- [Publication](../concepts/publication-and-ports.md)
