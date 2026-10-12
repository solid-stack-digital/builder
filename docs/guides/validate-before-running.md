# Validate before running

Use `builder check` for a service project and `builder mesh check` for a mesh. Add `builder mesh check --require-tester` when the mesh must be ready for global E2E.

Checks cover configuration shape and effective stages, Dockerfile requirements, dependency Compose validity, endpoint ownership/readiness, mesh contracts/bindings, and tester contracts. Errors identify the relevant config path and reason where available.

`--skip-checks` on an `up` command skips preflight checks invoked by that flow; it is a speed/diagnostic option, not a replacement for valid configuration. See [configuration errors](../troubleshooting/configuration-errors.md) and the [CLI reference](../reference/cli.md).

## Related

- [Service quickstart](../getting-started/service-quickstart.md)
- [CLI reference](../reference/cli.md)
- [Configuration troubleshooting](../troubleshooting/configuration-errors.md)
