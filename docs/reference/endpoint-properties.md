# Endpoint references and properties

A reference in source `build.json` has `${main.endpoints.http.network_url}` or `${db.endpoints.tcp.network_host}` form. A mesh-authored source-local reference uses `${source.main.endpoints.http.network_url}`. A cross-source reference uses `${backend.source.main.endpoints.http.network_url}`. References are allowed only to nodes in the consumer's effective requisite closure; another mesh root being active is insufficient. They configure values and never create graph edges.

| Property | Value | Preconditions |
|---|---|---|
| `network_host` | Generated Docker network hostname | Endpoint reachable in graph. |
| `network_port` | Internal endpoint port | Endpoint reachable. |
| `network_address` | Host and internal port | Endpoint reachable. |
| `network_url` | Scheme, host and internal port | Endpoint has `scheme`. |
| `public_host` | Host access name | Endpoint effectively published. |
| `public_port` | Effective fixed/AUTO host port | Endpoint effectively published. |
| `public_address` | Public host and port | Endpoint effectively published. |
| `public_url` | Scheme, host and public port | Published and has `scheme`. |

Standalone endpoints with `publicPort` are published when reachable. Mesh endpoints stay private unless a source `publish` selector chooses them. `publicPort` is a capability, not an instruction to publish in a mesh. Main `PORT` follows primary internal `port`, never `public_port`. A tester may use public properties for black-box tests; bridge-connected testers may use network properties when network reachability is configured explicitly.
