# Connect with endpoint references

Use Builder references instead of hardcoding generated Compose names, IP addresses, or allocated host ports.

In service `build.json` environment values:

```text
${app.endpoints.<endpoint>.<property>}
${dependencies.<dependency>.endpoints.<endpoint>.<property>}
```

In mesh `mesh.json` environment values:

```text
${<service>.app.endpoints.<endpoint>.<property>}
${<service>.dependencies.<dependency>.endpoints.<endpoint>.<property>}
```

There is no `services.` prefix in mesh references. All eight properties are `network_host`, `network_port`, `network_address`, `network_url`, `public_host`, `public_port`, `public_address`, and `public_url`; the [property reference](../reference/endpoint-properties.md) gives requirements and examples.

References may be embedded in larger strings, for example `${backend.app.endpoints.http.network_url}/v1`. `network_url` and `public_url` require an endpoint `scheme`; all `public_*` properties require effective publication. Unknown or unavailable references fail validation. `$$` represents a literal dollar where Builder/Compose interpolation would otherwise apply.

When a consumer's logical dependency is bound to a mesh provider, its dependency reference resolves through the provider app endpoint with the same endpoint name. Endpoint references provide values; they do not create startup/readiness ordering. Add `dependsOn` or a dependency binding for ordering.

Service and mesh tester environments are host-side clients and may use only `public_*` properties. An endpoint must actually be published for the selected E2E composition.

## Related

- [Endpoint properties](../reference/endpoint-properties.md)
- [Environment](environment.md)
- [Dependency substitution](dependency-substitution.md)
