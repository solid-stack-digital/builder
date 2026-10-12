# Stage execution matrix

Configuration overlay names are `dev`, `prod`, `test`, and `e2e`. CLI `test-unit` maps to `test`; CLI `test-e2e` maps to `e2e`. E2E structured configuration inherits `prod` before applying `e2e`.

## Service commands

| Command | Structured config | App target | App `EXEC_MODE` | App `INFRA_MODE` | Tester target / mode | App dotenv | Tester dotenv |
|---|---|---|---|---|---|---|---|
| `service up dev` | `base -> dev` | `dev` | `dev` | `isolated` | — | `.env.dev` | — |
| `service up dev --full` | `base -> dev` | `dev` | `dev` | `integrated` | — | `.env.dev` | — |
| `service up prod` | `base -> prod` | `prod` | `prod` | `integrated` | — | `.env.prod` | — |
| `service up test-unit` | `base -> test` | `test` | `test` | `isolated` | — | `.env.test` | — |
| `service up test-e2e` | `base -> prod -> e2e` | `prod` | `prod` | `integrated` | `test-e2e` / `e2e` | `.env.e2e` | `.env.e2e-tester` |

`service up test` runs unit/isolated tests first, followed by service E2E only after success.

## Mesh commands

| Command | Mesh/build config | App target / mode | App `INFRA_MODE` | App dotenv | Tester |
|---|---|---|---|---|---|
| `mesh up dev` | `base -> dev` | `dev` / `dev` | `integrated` | each service `.env.dev` | — |
| `mesh up prod` | `base -> prod` | `prod` / `prod` | `integrated` | each service `.env.prod` | — |
| `mesh up test-unit` | `base -> test` | `test` / `test` | `isolated` | each service `.env.test` | — |
| `mesh up test-e2e` | `base -> prod -> e2e` | `prod` / `prod` | `integrated` | each service `.env.e2e` | global `test-e2e` runner, `EXEC_MODE=e2e`, no `INFRA_MODE`, root `.env.e2e-tester` |

Global E2E apps use production runtime semantics. The tester is a separate finite host-side process.

## Canonical `mesh up test`

1. For every root `mesh.json.services` entry, sequentially run its standalone unit/isolated lifecycle, its service E2E lifecycle, and full teardown.
2. Start a fresh `base -> prod -> e2e` mesh with production-mode apps, run the global tester, and fully tear it down.

Stage-only mesh services participate in Phase 2 when effective, but not Phase 1 unless also declared at root. The explicit `mesh up test-unit` command is mesh `test` stage tooling and is not Phase 1 of the canonical pipeline.

See [environment precedence](environment-precedence.md) for source-by-source ordering.
