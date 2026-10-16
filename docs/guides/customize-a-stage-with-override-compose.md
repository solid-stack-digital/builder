# Customize one main stage

Place a safe Compose fragment at a path selected by `<stage>.services.main.override-compose`. It contains only `services.main`, for example `build.args`, environment and a safe source bind mount. The selected override is one file; E2E selection replaces prod selection. Builder protects main build target/context, ports, lifecycle dependencies, network/name ownership, and health. Mesh `extends.main.env` wins over override env. See the [override contract](../reference/override-compose-contract.md).
