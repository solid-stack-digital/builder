# Migrate from V1/V1.2 to V2

V2 is intentionally breaking. Legacy fields are rejected; Builder does not silently translate them.

## Removed build.json fields

Removed root/service fields: `port`, `envOverrides`, `overrides`, `composeFiles`, `services`, `policy`, `policies`, `injects`, and `sidecars`. Removed dependency shortcuts: `dependencies.<name>.path`, `.service`, `.port`, and `.ports`. Removed tester field: `tester.envOverrides`.

| Old intent | V2 replacement |
|---|---|
| Root/app port | `app.endpoints.<name>.port` and optional `publicPort` |
| Dependency path | `dependencies.<name>.compose` |
| Dependency service/port | Endpoint-level `service` and `port` under named dependency endpoints |
| `envOverrides` | Correct owner `env` map (app, dependency, mesh service, or tester) |
| Old override syntax | `<stage>.override-compose` with app-only restrictions |
| Injects | Consumer-owned env values containing endpoint references |
| Sidecars | Dependency's atomic multi-service Compose implementation, where appropriate |

## Removed mesh.json fields

Removed fields: root `dependencies`; `services.<name>.port`, `.preservePort`, `.provideDependency`, `.replaceMocks`, `.envOverrides`, `.healthcheck`; `tester.path`, `.dockerfile`, `.envOverrides`, `.policy`; and `inherit-published`.

| Old intent | V2 replacement |
|---|---|
| Provider/replaceMocks | `services.<consumer>.dependencies` binding |
| Service port | Build app endpoint plus mesh `publish` |
| `envOverrides` | `env` at the owning service/tester layer |
| Mesh service healthcheck | Service Dockerfile healthcheck |
| Tester path/Dockerfile | `tester.compose` and exact `tester.service` |
| `inherit-published` | Explicit merged `publish` lists for each stage |

## Migration order

1. Declare named app endpoints.
2. Move local dependencies to Compose declarations.
3. Move dependency service/port data into named endpoints with explicit owners.
4. Replace injected values with endpoint references in the consumer's env.
5. Move stage behavior to `dev`, `prod`, `test`, or `e2e` overlays.
6. Run `builder check` and service tests.
7. List mesh services with paths and add provider bindings.
8. Select host endpoints explicitly in mesh `publish`.
9. Configure service/global testers with public endpoint references.
10. Run `builder mesh check`, then mesh tests.

See [build.json](../reference/build-json.md), [mesh.json](../reference/mesh-json.md), and [stages](../concepts/stages.md).

## Related

- [build.json reference](../reference/build-json.md)
- [mesh.json reference](../reference/mesh-json.md)
- [Validate before running](../guides/validate-before-running.md)
