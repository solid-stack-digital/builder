# Name the endpoints your service provides

An endpoint is an explicit connectivity contract. Its `port` is always the container/network port; it is not a host port. App endpoints live at `app.endpoints`; dependency endpoints live under `dependencies.<name>.endpoints` and additionally name their exact Compose owner with `service`.

App endpoint fields are `port`, optional `publicPort`, optional `primary`, and optional `scheme`. Dependency endpoints use the same fields plus required `service`. Ports are integers from 1 through 65535. `publicPort` is a fixed port or `AUTO`. `scheme` is URL metadata, not a transport selector. A non-empty endpoint map needs exactly one effective `primary: true`. The app primary's `port` becomes Builder-owned `PORT`.

Example app endpoints:

```json
{
  "app": {
    "endpoints": {
      "http": { "port": 3000, "publicPort": "AUTO", "primary": true, "scheme": "http" },
      "metrics": { "port": 9090, "scheme": "http" }
    }
  }
}
```

A dependency can expose `api` and `admin-ui` endpoints owned by different Compose services. Each owner is declared explicitly; Builder never guesses from a service count or port. URL references need `scheme`; host-facing properties need effective publication.

See the [endpoint property table](../reference/endpoint-properties.md), [references](endpoint-references.md), and [publication rules](publication-and-ports.md).

## Related

- [Endpoint properties](../reference/endpoint-properties.md)
- [Dependency Compose contract](../reference/dependency-compose-contract.md)
- [Publish mesh endpoints](../guides/publish-mesh-endpoints.md)
