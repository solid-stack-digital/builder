# Avoid hardcoding an AUTO host port

Declare `publicPort: "AUTO"` and select the endpoint for mesh publication. Consume the resolved value in a tester with `${gateway.app.endpoints.http.public_url}` or export the app environment with `builder service export env`.

AUTO is allocated for the effective composition. Do not assume the same literal port in unrelated projects or runs; use references and exported values. See [publication](../concepts/publication-and-ports.md).

## Related

- [Endpoint properties](../reference/endpoint-properties.md)
- [Export environment](../guides/export-resolved-environment.md)
- [Publish mesh endpoints](../guides/publish-mesh-endpoints.md)
