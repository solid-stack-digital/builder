# Dependency Compose contract

One dependency Compose file is one atomic local dependency implementation. It can contain multiple services and named resources. If the dependency is integrated, the implementation comes as a unit; if substituted in a mesh, the local unit is suppressed as a whole.

Every dependency endpoint must name its exact Compose owner through `service`. Each distinct endpoint-owning service needs a valid enabled Compose healthcheck. One healthcheck covers multiple endpoints on that same service; a helper also needs a healthcheck when another service lists it in `depends_on`.

Allowed Compose features include image/build services, internal `depends_on`, internal networks, named volumes, configs, secrets, and companion services, subject to valid references and Builder namespacing. Builder rejects raw service `ports`, `network_mode: host`, `privileged: true`, fixed `container_name`, host-root bind mounts, dependency profiles, and dependency `extends`. The dependency file cannot use a root `include` escape hatch. Compose paths and local build contexts are interpreted relative to their source file and preserved when inlined.

All generated `depends_on` edges use `condition: service_healthy`. File-backed configs and secrets must name existing regular files when their dependency is materialized.
For a materialized dependency, a local `build.context` must be an existing directory, and its explicit or default Dockerfile must be an existing regular file. `dockerfile_inline` does not require a physical Dockerfile. Remote build contexts are not checked as local files. Suppressed and inert dependency implementations are not materialized.

Builder scopes owned volumes, networks, configs, and secrets to its Compose project even if their source definitions set `name`. An owned volume that previously used a fixed global name will receive a new project-scoped name; existing data is not migrated automatically. To share an existing external resource intentionally, declare `external: true`. Builder preserves that resource's external name and never removes it as an owned resource.

Do not use Builder-generated internal service/resource names in your configuration. Use endpoint references. Host publication is configured by endpoint `publicPort` and, in a mesh, `publish`; dependency Compose `ports` are forbidden.

## Related

- [Local dependencies](../concepts/local-dependencies.md)
- [Dependencies quickstart](../getting-started/dependencies-quickstart.md)
- [build.json](build-json.md)
