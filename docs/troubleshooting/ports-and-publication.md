# Troubleshoot ports and publication

- **Fixed port already used/colliding:** choose an available fixed host port or use `AUTO`; Builder does not remap a fixed request.
- **Public reference unavailable:** verify the endpoint has `publicPort` and is effectively published.
- **Mesh endpoint remains private:** `publicPort` alone is not publication. Add the path to mesh `services.<name>.publish`.
- **Cannot publish consumer's substituted dependency:** the local dependency is suppressed; publish the provider app endpoint instead.
- **AUTO port differs from expectation:** it is selected for the effective composition. Consume it through endpoint references/export rather than assuming a literal.

See [publication and ports](../concepts/publication-and-ports.md), [endpoint properties](../reference/endpoint-properties.md), and [publish guide](../guides/publish-mesh-endpoints.md).

## Related

- [Endpoint properties](../reference/endpoint-properties.md)
- [Publish mesh endpoints](../guides/publish-mesh-endpoints.md)
- [CLI reference](../reference/cli.md)
