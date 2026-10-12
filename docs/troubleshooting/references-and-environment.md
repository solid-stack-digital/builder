# Troubleshoot references and environment

- **Bad reference grammar:** use build forms `${app.endpoints...}` / `${dependencies...}` or mesh forms `${backend.app...}` / `${frontend.dependencies...}`. Mesh references have no `services.` prefix.
- **URL unavailable:** add an endpoint `scheme` before requesting a `*_url` property.
- **Tester rejects network property:** testers run as host-side clients; replace `network_url` with an effectively published `public_url`.
- **Reference unresolved after substitution:** provider must expose the exact endpoint name referenced through the logical dependency.
- **Builder env conflict:** remove user values for Builder-owned keys such as `EXEC_MODE`, `INFRA_MODE`, or primary app `PORT`.
- **Environment type rejected:** quote textual values; Builder JSON env supports strings only.
- **Need literal `${...}`:** use `$$` to escape a literal dollar where Builder/Compose interpolation applies.
- **Reference exists but service not ready:** references do not add lifecycle edges; configure readiness separately.

See [endpoint references](../concepts/endpoint-references.md), [environment precedence](../reference/environment-precedence.md), and [identifier rules](../reference/identifier-rules.md).

## Related

- [Endpoint properties](../reference/endpoint-properties.md)
- [Environment](../concepts/environment.md)
- [Dependency substitution](../concepts/dependency-substitution.md)
