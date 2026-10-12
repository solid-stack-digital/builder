# Troubleshoot tests and testers

- **`mesh test-e2e` says tester is missing:** configure root `mesh.json.tester.compose` and `tester.service`; the `mesh up test` pipeline also needs it.
- **`mesh check --require-tester` fails:** root global tester is absent or invalid; this option intentionally makes it required.
- **Tester service not found:** `tester.service` must exactly match a service key in tester Compose; Builder does not infer a runner.
- **Service tester cannot reach app:** service tester is outside the app network; publish the app endpoint and use a public property.
- **E2E unexpectedly lacks a value:** E2E inherits structured `prod` values before `e2e`; it uses `.env.e2e` and does not merge `.env.prod`. The app uses `EXEC_MODE=prod`; only the tester uses `EXEC_MODE=e2e`.
- **Confusing service/global E2E:** service E2E runs one production-mode app with local dependencies and its `test-e2e` tester. Global mesh E2E runs production-mode apps with the root tester. Canonical `mesh test` runs each root service unit + service E2E lifecycle before global E2E.

See [testing model](../concepts/testing-model.md), [service E2E](../guides/configure-service-e2e.md), and [global mesh E2E](../guides/configure-global-mesh-e2e.md).

## Related

- [Stage matrix](../reference/stage-matrix.md)
- [Global tester guide](../guides/configure-global-mesh-e2e.md)
- [CLI reference](../reference/cli.md)
