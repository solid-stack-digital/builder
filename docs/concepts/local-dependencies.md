# Ordinary Compose modules

An ordinary service is an atomic module: when reachable, all containers and owned resources in its Compose file materialize. Endpoints identify owner containers; a `service` selects the lifecycle representative. Endpoint-less modules are allowed with an explicit `service` and can be prerequisites. Dormant declarations do not start or allocate host ports. The module's Builder env reaches every member, while native per-container defaults remain. Cleanup removes the module as part of the owned composition. See the [Compose contract](../reference/dependency-compose-contract.md).

Isolated runs start no ordinary module unless `dev` or `test` `on-inframode-isolated` adds a requisite from `main` to it. Such a local helper waits and is health-checked like any module, while main keeps `INFRA_MODE=isolated`. See [isolated-only configuration](../reference/build-json.md#isolated-only-configuration).
