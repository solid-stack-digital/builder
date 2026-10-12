# Troubleshoot Docker and Compose

- **Docker not found:** install Docker Engine and ensure `docker` is on PATH.
- **Daemon unavailable:** start the daemon and verify your account has access.
- **Compose too old:** Builder requires Docker Compose 2.24.0 or newer.
- **Dockerfile target/healthcheck error:** provide `dev`, `test`, `test-e2e`, and `prod`; dev/prod require valid healthchecks. See [Dockerfile contract](../reference/dockerfile-contract.md).
- **Dependency Compose rejected:** endpoint owners need healthchecks; remove raw ports, host networking, privileged mode, fixed container names, and unsupported profiles/extends. See [dependency contract](../reference/dependency-compose-contract.md).
- **Path does not resolve:** Builder-managed project paths are relative and remain within their project root. Raw Compose local paths are resolved from the Compose file. Check spelling and source-file-relative paths.
- **Network allocation warning/failure:** Docker can exhaust networks after many disposable environments. Stop stale projects, then use `builder prune` for stopped containers/unused networks. Add `--volumes` only when dangling volume data may be discarded.

## Related

- [Installation](../getting-started/installation.md)
- [Dependency Compose contract](../reference/dependency-compose-contract.md)
- [Cleanup](../guides/clean-up-builder-resources.md)
