# Configuration stages

Build stages are `dev`, `prod`, `test`, `e2e`; mesh stages are `dev`, `prod`, `e2e`. E2E inherits structured prod before E2E overlay. Objects merge recursively; scalars and arrays replace; `false` removes a requisite. Source `compose` and mesh `source` paths are immutable after base declaration. A stage-added local ordinary service remains dormant until reachable; a top-level mesh source added in a stage becomes a root there. See the [stage matrix](../reference/stage-matrix.md).
