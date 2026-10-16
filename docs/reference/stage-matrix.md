# Workflow and stage matrix

Configuration stage, main Dockerfile target, execution variables, and workflow phase are separate concepts. Only main receives Builder's `EXEC_MODE` and `INFRA_MODE`. `PORT`, when present, is the primary **internal** endpoint port.

| Command or phase | Config overlay | Main target | `EXEC_MODE` | `INFRA_MODE` | Main dotenv | Tester dotenv |
|---|---|---|---|---|---|---|
| `service up dev` | dev | dev | dev | isolated | `.env.dev` | — |
| `service up dev --full` | dev | dev | dev | integrated | `.env.dev` | — |
| `service up prod` | prod | prod | prod | integrated | `.env.prod` | — |
| `service up test-unit` | test | test | test | isolated | `.env.test` | — |
| `service up test-e2e` | prod → e2e | prod | prod | integrated | `.env.e2e` | `.env.e2e-tester` |
| `service up test` | unit, then E2E | test, then prod | test, then prod | isolated, then integrated | phase-specific | E2E only |
| `mesh up dev` | source dev → mesh dev | dev | dev | integrated | each source `.env.dev` | — |
| `mesh up prod` | source prod → mesh prod | prod | prod | integrated | each source `.env.prod` | — |
| `mesh up test` Phase 1 | each base source test | test, then prod | test, then prod | isolated, then integrated | source phase-specific | source E2E only |
| `mesh up test` Phase 2 | source prod → e2e, mesh prod → e2e | prod | prod | integrated | each source `.env.e2e` | mesh `.env.e2e-tester` |

The tester's image or build target comes from its own Compose file and selected runner service; Builder injects no tester execution variables. Phase 1 finishes and cleans one base source before the next. Phase 2 starts a fresh global composition. `test-unit` and `test-e2e` are standalone command conveniences, not Dockerfile target names.
