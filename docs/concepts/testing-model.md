# Unit, service E2E, and mesh E2E

`service up test-unit` runs the `test` Dockerfile target with the `test` configuration overlay and isolated dependencies. `service up test-e2e` uses the `prod` app image target with `e2e` runtime configuration, integrates local dependencies, and runs the service's `test-e2e` tester target. `service up test` runs unit tests first and skips E2E if they fail.

`mesh up test-unit` runs per-service isolated unit tests using effective `test` overlays. `mesh up test-e2e` runs one global E2E composition using `e2e` configuration and a root `mesh.json.tester` runner. `mesh up test` runs mesh unit tests first and then that global E2E phase; it does not run each service's service-level E2E tester.

Testers are host-side clients. Their env can use only public endpoint properties, and the services they need must be published. E2E is not a `prod` runtime overlay: it uses the production app image target with E2E runtime configuration.

## Related

- [Configure service E2E](../guides/configure-service-e2e.md)
- [Configure global mesh E2E](../guides/configure-global-mesh-e2e.md)
- [Stage matrix](../reference/stage-matrix.md)
