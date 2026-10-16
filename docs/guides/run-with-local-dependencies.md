# Run with ordinary services

Declare an ordinary service under `services.<name>` with `compose` and representative `service`, then add an explicit requisite from main or a reachable ordinary consumer. `dependency` waits for health; `prerequisite` waits for a successful job; `requirement` includes without ordering. An endpoint-less module is valid and runnable if it has `service`. `builder service up dev --full` and `prod` use the active graph; isolated dev does not start ordinary nodes. The [Compose contract](../reference/dependency-compose-contract.md) explains member ownership.
