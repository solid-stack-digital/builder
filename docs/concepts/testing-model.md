# Unit, service E2E, and mesh E2E

## Standalone service

`service up test` runs two finite phases: unit/isolated tests, then service E2E if the unit phase succeeds. The E2E app uses Docker target `prod`, `EXEC_MODE=prod`, `INFRA_MODE=integrated`, and `.env.e2e`. Its tester uses target `test-e2e`, `EXEC_MODE=e2e`, no `INFRA_MODE`, and `.env.e2e-tester`.

## Global mesh

`mesh up test` runs these phases:

```text
Phase 1
for each root mesh.json.services entry, sequentially:
  standalone service unit/isolated test
  service E2E
  full teardown

Phase 2
fresh base -> prod -> e2e mesh
  production-mode apps
  global E2E tester
  full teardown
```

Any failure stops subsequent work. Each finite composition is torn down, so Phase 1 state does not leak into Phase 2. Services added only by a stage are not Phase-1 members unless they also appear in root `services`. `mesh up test-unit` remains an explicit mesh `test` stage operation, not canonical Phase 1.

Testers are host-side clients and may use only effectively published `public_*` endpoint properties. E2E applications run as production code; only tester processes use `EXEC_MODE=e2e`.

## Related

- [Configure service E2E](../guides/configure-service-e2e.md)
- [Configure global mesh E2E](../guides/configure-global-mesh-e2e.md)
- [Stage matrix](../reference/stage-matrix.md)
