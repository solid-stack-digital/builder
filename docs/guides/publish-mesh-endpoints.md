# Publish mesh endpoints

An endpoint's `publicPort` makes it eligible for host publication. It does not publish by itself in a mesh. Mesh services are private by default; list the desired endpoint path in `services.<name>.publish`.

```json
{
  "services": {
    "gateway": { "path": "../gateway", "publish": ["app.endpoints.http"] },
    "backend": { "path": "../backend", "publish": [] }
  }
}
```

App target syntax is `app.endpoints.<endpoint>`. An unsubstituted local dependency target is `dependencies.<dependency>.endpoints.<endpoint>`. A substituted dependency cannot be published through the consumer; publish the provider app endpoint. Fixed ports fail on collision; `AUTO` is allocated. Host references resolve to `127.0.0.1` and are best consumed through endpoint references or tester env.

Recommended pattern: publish only a gateway and keep internal services private.

## Related

- [Publication concept](../concepts/publication-and-ports.md)
- [Endpoint properties](../reference/endpoint-properties.md)
- [Port troubleshooting](../troubleshooting/ports-and-publication.md)
