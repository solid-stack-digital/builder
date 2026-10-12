# Troubleshoot tests and testers

- **`mesh test-e2e` says tester is missing:** configure root `mesh.json.tester.compose` and `tester.service`; the `mesh up test` pipeline also needs it.
- **`mesh check --require-tester` fails:** root global tester is absent or invalid; this option intentionally makes it required.
- **Tester service not found:** `tester.service` must exactly match a service key in tester Compose; Builder does not infer a runner.
- **Service tester cannot reach app:** service tester is outside the app network; publish the app endpoint and use a public property.
- **E2E unexpectedly lacks prod env:** expected behavior. E2E uses the prod image target with e2e runtime config and does not inherit prod overlays.
- **Confusing service/global E2E:** service E2E runs one service's `test-e2e` target with local dependencies. Global mesh E2E runs one root tester against the full E2E mesh.

See [testing model](../concepts/testing-model.md), [service E2E](../guides/configure-service-e2e.md), and [global mesh E2E](../guides/configure-global-mesh-e2e.md).

## Related

- [Stage matrix](../reference/stage-matrix.md)
- [Global tester guide](../guides/configure-global-mesh-e2e.md)
- [CLI reference](../reference/cli.md)
