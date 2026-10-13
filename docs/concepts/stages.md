# Stages and overlays

`build.json` has four overlays: `dev`, `prod`, `test`, and `e2e`. `mesh.json` has three: `dev`, `prod`, and `e2e`. Service CLI `test-unit` uses the build `test` overlay; CLI `test-e2e` uses `e2e`. The mesh `test` command runs the two-phase pipeline; it is not an overlay. A root `mesh.json.test` field is rejected.

Build inheritance chains:

```text
dev  = base -> dev
prod = base -> prod
test = base -> test
e2e  = base -> prod -> e2e
```

Mesh inheritance chains:

```text
dev  = base -> dev
prod = base -> prod
e2e  = base -> prod -> e2e
```

Objects and maps merge by key. Stage scalar values replace matching values; omitted values inherit, and stage-only entries are added. Arrays normally replace their base array. Build dependency `dependsOn`, mesh service `dependsOn`, and mesh service `publish` use stable union. V2 has no deletion syntax. A dependency’s inherited `compose` implementation cannot be replaced by a later stage; a newly added dependency must provide its own `compose`.

E2E inherits the structured `prod` configuration, including app and mesh environment, endpoints, dependencies, bindings, and publications. It selects `.env.e2e`; `.env.prod` is not merged into that file. For execution details, see the [stage matrix](../reference/stage-matrix.md).

## Related

- [Environment](environment.md)
- [Stage-only services and dependencies](../guides/use-stage-only-services-and-dependencies.md)
- [Stage matrix](../reference/stage-matrix.md)
