# Identifier rules

Builder keys used in endpoint-reference paths match `^[a-z][a-z0-9-]*$`. This applies to dependency keys, endpoint keys, and top-level mesh service names.

Valid: `backend`, `payments-api`, `http`, `admin-ui`.

Invalid: `Backend`, `payments_api`, `payments.api`, `1backend`.

Mesh service names additionally cannot be `app`, `dependencies`, `tester`, `services`, `dev`, `prod`, `test`, or `e2e`. A dependency endpoint's `service` field is a Compose service key, not a Builder logical identifier; it must exactly name a service in that Compose file.

## Related

- [build.json reference](build-json.md)
- [mesh.json reference](mesh-json.md)
- [Endpoint references](../concepts/endpoint-references.md)
