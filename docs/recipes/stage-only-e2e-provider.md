# Add an E2E-only mesh service

Declare an `audit` source under mesh `e2e.services` with a complete `source` path. It becomes an E2E root but does not join Phase 1 base-source tests. If another source needs it, add an explicit mesh `extends` requisite and rewrite that consumer's effective env URL. For an E2E-only local job within a source, declare the ordinary module and add a prerequisite edge; declaration alone remains dormant. No V2 provider substitution remains. See [stage-only services](../guides/use-stage-only-services-and-dependencies.md).
