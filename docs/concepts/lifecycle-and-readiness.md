# Reachability and readiness

`requirement` includes a service without ordering; `dependency` waits for representative health; `prerequisite` waits for exit 0. Requirement-only cycles are allowed. The ordering subgraph must be acyclic, and a target cannot be both dependency and prerequisite. Main dev/prod health is required. Service and global E2E wait on every reachable long-running representative and completed prerequisite; a helper container does not define tester status. See the [Compose contract](../reference/dependency-compose-contract.md).

An ordinary representative may declare health in Compose or inherit it from its built or pulled image. Builder records missing Compose health as a deferred check and inspects the prepared image before creating containers. Explicitly disabled health fails when health is required. Image preparation does not consume the 120-second startup readiness deadline; Builder checks host port availability again immediately before startup.
