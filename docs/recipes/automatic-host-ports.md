# Avoid hardcoding an AUTO host port

Declare `publicPort: "AUTO"` and select the endpoint for mesh publication. Consume the resolved value in a tester with `${gateway.app.endpoints.http.public_url}`. To include the allocated URL in `builder service export env`, first put a `public_url` reference in `build.json.app.env`, for example `"PUBLIC_URL": "${app.endpoints.http.public_url}"`. Export copies resolved app environment values; it does not emit a separate endpoint registry.

AUTO is allocated for the effective composition. Do not assume the same literal port in unrelated projects or runs; use references and exported values. See [publication](../concepts/publication-and-ports.md).

## Related

- [Endpoint properties](../reference/endpoint-properties.md)
- [Export environment](../guides/export-resolved-environment.md)
- [Publish mesh endpoints](../guides/publish-mesh-endpoints.md)
