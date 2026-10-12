# Stage execution matrix

Configuration overlay names are `dev`, `prod`, `test`, `e2e`. CLI `test-unit` maps to `test`; CLI `test-e2e` maps to `e2e`.

## Service commands

| Command | JSON overlay | App target | Tester target | `EXEC_MODE` | `INFRA_MODE` | Local dependencies | Tester included | Dotenv | Use |
|---|---|---|---|---|---|---|---|---|---|
| `service up dev` | `dev` | `dev` | — | `dev` | `isolated` | No | No | `.env.dev` | Fast app development |
| `service up dev --full` | `dev` | `dev` | — | `dev` | `integrated` | Yes, endpoint-bearing | No | `.env.dev` | Develop against local infra |
| `service up prod` | `prod` | `prod` | — | `prod` | `integrated` | Yes | No | `.env.prod` | Production-like run |
| `service up test-unit` | `test` | `test` | — | `test` | `isolated` | No | No | `.env.test` | Unit/integration runner |
| `service up test-e2e` | `e2e` | `prod` | `test-e2e` | `e2e` | `integrated` | Yes | Yes | `.env.e2e` | Service-level E2E |
| `service up test` | test then e2e | `test`, then `prod` | `test-e2e` | `test`, then `e2e` | `isolated`, then `integrated` | Per phase | E2E phase | `.env.test`, then `.env.e2e` | Full service tests |

## Mesh commands

| Command | Mesh/build overlays | App target | Runtime / `EXEC_MODE` | `INFRA_MODE` | Local dependencies | Bindings | Publication | Global tester | Use |
|---|---|---|---|---|---|---|---|---|---|
| `mesh up dev` | `dev` | `dev` | `dev` | `integrated` | Integrated unless substituted | Applied | Effective `mesh.dev` `publish` | No | Integrated mesh development |
| `mesh up prod` | `prod` | `prod` | `prod` | `integrated` | Integrated unless substituted | Applied | Effective `mesh.prod` `publish` | No | Production-like system |
| `mesh up test-unit` | `test` | `test` | `test` | `isolated` | No | Validated but not integrated | Test app publication is validated for isolated runs | No | Per-service unit tests |
| `mesh up test-e2e` | `e2e` | `prod` | `e2e` | `integrated` | Integrated unless substituted | Applied | Effective `mesh.e2e` `publish` | Required | Full-system E2E |
| `mesh up test` | test then e2e | `test`, then `prod` | `test`, then `e2e` | `isolated`, then `integrated` | Per phase | Per phase | E2E mesh publication | Required | Unit then global E2E |

**Production image target does not mean production runtime configuration.** E2E uses the `prod` app target with `e2e` runtime configuration; it does not inherit prod env overlays.

## Related

- [Stages](../concepts/stages.md)
- [Testing model](../concepts/testing-model.md)
- [CLI reference](cli.md)
