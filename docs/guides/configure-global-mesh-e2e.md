# Configure a global mesh E2E runner

In mesh `services.tester`, set `compose`, selected `service`, and runner `env`. Mesh `.env.e2e-tester` belongs to this runner; source tester env and source testers are not copied into global E2E. Publish only endpoints the black-box runner needs and ensure its network can reach those URLs. Run `builder mesh up test`: sequential source tests finish and clean before the fresh global E2E phase. There is no public `mesh up test-e2e`. See the [stage matrix](../reference/stage-matrix.md).
