# Choose service or mesh configuration

A service project describes one independently runnable application. A mesh project combines independent service projects and owns the wiring between them.

| Question | Configure it here |
|---|---|
| App ports and endpoint names? | `build.json` under `app.endpoints` |
| Local Postgres, Redis, emulator, or mock? | `build.json` under `dependencies` |
| Map a logical dependency to a real service? | `mesh.json` under `services.<consumer>.dependencies` |
| Publish an endpoint from a mesh? | `mesh.json` under `services.<name>.publish` |
| Full-system E2E runner? | Root `mesh.json.tester` |

`build.json` owns app endpoints, local dependency contracts and Compose implementations, app/dependency/tester environment, and service stage overlays. `mesh.json` owns participating service projects, dependency bindings, composition environment, top-level readiness dependencies, endpoint publication, the global tester, and mesh overlays.

The mesh uses endpoint declarations from each service project. It cannot redefine a service endpoint's port or scheme. A dependency binding replaces a local dependency implementation as a whole; app code keeps referring to the logical dependency endpoint.

See [local dependencies](local-dependencies.md), [dependency substitution](dependency-substitution.md), and the [configuration references](../reference/build-json.md) and [mesh.json reference](../reference/mesh-json.md).

## Related

- [Service quickstart](../getting-started/service-quickstart.md)
- [Mesh quickstart](../getting-started/mesh-quickstart.md)
- [Build a mesh](../guides/build-a-mesh.md)
