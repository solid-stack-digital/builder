# `mesh.json` reference (V3)

A mesh needs `name`, `services.tester`, and at least one source. Each source needs an immutable `source` directory containing its own complete `build.json`. The tester needs `compose` and selected `service`. The key `main` is reserved in mesh `services`.

| Location | Fields | Effect |
|---|---|---|
| `services.<alias>` | `source`, `extends`, `publish` | Every effective source is a root in mesh dev/prod/E2E. |
| `services.<alias>.extends.<local>` | `env`, `endpoints`, `requisites`, `override-compose` and applicable ordinary fields | Overrides an existing source-local service. It cannot replace its `compose`. |
| `services.<alias>.publish` | Array of `<local>.endpoints.<endpoint>` | Selects already reachable, `publicPort`-capable endpoints for host access. |
| `services.tester` | `compose`, `service`, `env` | Global E2E runner; no source tester is copied into global E2E. |
| `dev`, `prod`, `e2e` | `services` overlays | Arrays replace, and `false` removes a requisite. There is no mesh `test` config overlay. |

Source overlays apply in source base → source selected stage order; then mesh base `extends` and selected mesh overlay apply. Global E2E uses source and mesh `prod` followed by `e2e`. Source-local `compose` and mesh `source` are immutable after declaration. Stage-added top-level mesh sources become roots in their active stage; they are not part of base-source Phase 1 tests.

`source.<local>` identifies a source-local requisite in a mesh overlay. A fellow source alias names its main. References to another source use `${alias.source.main.endpoints.http.network_url}`. The reference does not add an edge. To replace a local mock, remove its edge, add a real edge, and rewrite each surviving URL. See the [complete docs-mesh fixture](../examples/docs-mesh/mesh.json) and [source replacement recipe](../recipes/real-service-replaces-local-mock.md).

A mesh is private by default. For example, `publish: ["main.endpoints.http"]` selects `main.endpoints.http` from that source. `publish` replaces the previous array in a stage; it does not accumulate entries. A selector requires a reachable endpoint with `publicPort`. `builder mesh up test` first tests each base source independently and then runs a fresh global E2E composition. Public mesh `up` stages are `dev`, `prod`, and `test`.
