# Troubleshoot healthchecks and startup

- **Dependency endpoint owner rejected:** every distinct service named by dependency endpoint `service` needs a valid enabled Compose healthcheck.
- **Helper never becomes ready:** every generated `depends_on` edge uses `service_healthy`. Give a helper targeted by `depends_on` a working healthcheck, or remove that lifecycle edge if the helper is a finite job.
- **App dev/prod rejected:** those Dockerfile targets need valid effective healthchecks; finite test targets do not.
- **Healthcheck probes wrong port:** use Builder-provided `PORT` for the app primary endpoint rather than an unrelated hardcoded port.
- **dependsOn target missing:** use exact `dependencies.<logical-name>` syntax for dependency lifecycle, or exact mesh service keys for top-level lifecycle.
- **Cycle error:** remove a self-edge or break the dependency/readiness cycle.
- **Env reference resolves but target is not started first:** env references supply a value and do not create readiness. Add `dependsOn` or a provider binding.

See [lifecycle and readiness](../concepts/lifecycle-and-readiness.md), [dependency Compose contract](../reference/dependency-compose-contract.md), and [endpoint references](../concepts/endpoint-references.md).

## Related

- [Lifecycle and readiness](../concepts/lifecycle-and-readiness.md)
- [Dockerfile contract](../reference/dockerfile-contract.md)
- [Dependency Compose contract](../reference/dependency-compose-contract.md)
