# Stages and overlays

JSON configuration has exactly four overlay names: `dev`, `prod`, `test`, and `e2e`. CLI execution additionally accepts `test-unit` and `test-e2e`; these are commands, not JSON overlay names. `test-unit` uses the `test` overlay. `test-e2e` uses `e2e`.

Objects and maps merge by key. Stage scalar values replace matching base values; omitted values inherit, and stage-only entries are added. Arrays normally replace their base array. The exceptions are build dependency `dependsOn`, mesh service `dependsOn`, and mesh service `publish`, which use stable union: base entries first, then stage entries, removing exact duplicates. V2 has no deletion syntax.

Validation uses the effective configuration after overlay merge. A dependency or mesh service added in a stage must have a complete effective contract, including its required Compose/path fields.

E2E selects the `prod` Dockerfile target for the app but uses `e2e` runtime configuration. It does not inherit `.env.prod`, `prod.app.env`, or `mesh.prod`.

For each command, image target, dotenv file, tester, and dependency behavior, see the [stage matrix](../reference/stage-matrix.md). 

## Related

- [Environment](environment.md)
- [Stage-only services and dependencies](../guides/use-stage-only-services-and-dependencies.md)
- [Stage matrix](../reference/stage-matrix.md)
