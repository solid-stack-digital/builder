# Endpoint properties

Given an endpoint with `port: 3000`, `publicPort: 8080`, and `scheme: "http"`:

| Property | Example | Needs `scheme` | Needs effective publication | Typical consumer |
|---|---|---:|---:|---|
| `network_host` | `backend` | No | No | App/container |
| `network_port` | `3000` | No | No | App/container |
| `network_address` | `backend:3000` | No | No | App/container |
| `network_url` | `http://backend:3000` | Yes | No | App/container |
| `public_host` | `127.0.0.1` | No | Yes | Host/tester/browser |
| `public_port` | `8080` | No | Yes | Host/tester/browser |
| `public_address` | `127.0.0.1:8080` | No | Yes | Host/tester/browser |
| `public_url` | `http://127.0.0.1:8080` | Yes | Yes | Host/tester/browser |

In `build.json`, app syntax is `${app.endpoints.http.network_url}` and dependency syntax is `${dependencies.redis.endpoints.redis.network_host}`. In `mesh.json`, use `${backend.app.endpoints.http.network_url}` or `${frontend.dependencies.backend.endpoints.http.public_url}`. There is no `services.` prefix.

References can be embedded in text. `$$` escapes a literal dollar. Unknown endpoints/properties fail. Tester env is restricted to `public_*` properties.

Common errors:

- `network_url` without `scheme`: add a scheme such as `http` to the endpoint.
- `public_url` for a private mesh endpoint: give the endpoint `publicPort` and select it in mesh `publish`.
- Unknown endpoint: align the reference name with the effective endpoint map, including provider endpoint names after substitution.

## Related

- [Endpoint references](../concepts/endpoint-references.md)
- [Publication and ports](../concepts/publication-and-ports.md)
- [Troubleshoot references](../troubleshooting/references-and-environment.md)
