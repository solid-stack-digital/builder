# Publish endpoints to the host

An endpoint's `port` is its container/network port. Optional `publicPort` makes it publishable: set a fixed host port or `"AUTO"`. Effective publication determines whether a host mapping exists and whether `public_*` references can resolve.

For standalone service execution, a materialized endpoint with `publicPort` is published automatically. In a mesh, services are private by default: `publicPort` only makes an endpoint eligible. Add its exact path to `services.<name>.publish`, such as `app.endpoints.http` or `dependencies.mailpit.endpoints.http`.

Fixed ports must be in range 1–65535 and cannot collide. Builder fails on a fixed-port collision; it does not silently change your requested port. `AUTO` allocates an available port for the effective composition. The public host is `127.0.0.1`. Consume the resolved value through references or environment export instead of guessing it.

A substituted dependency's local endpoint is not present to publish. Publish the provider's app endpoint instead.

## Related

- [Publish mesh endpoints](../guides/publish-mesh-endpoints.md)
- [Endpoint properties](../reference/endpoint-properties.md)
- [Ports troubleshooting](../troubleshooting/ports-and-publication.md)
