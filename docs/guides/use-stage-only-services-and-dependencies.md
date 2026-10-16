# Use stage-only services

A local ordinary service added in `e2e.services.fixture-loader` remains dormant until `main.requisites.fixture-loader` or another reachable edge includes it. Use `prerequisite` if the loader must finish successfully before its consumer. A top-level source added under mesh `e2e.services.audit` becomes a root in global E2E, but is excluded from Phase 1 base-source tests. Complete new source declarations need a source path; complete ordinary declarations need Compose and representative/endpoint data. See [stages](../concepts/stages.md).
