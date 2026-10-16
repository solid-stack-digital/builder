# Ordinary service Compose contract

An ordinary service is an atomic Compose module. Its `compose` file may define several containers; when the node is reachable, Builder materializes all of them and their owned resources. `service` selects the representative; an endpoint's `service` selects its actual owner. A module without endpoints must declare `service`. If endpoints exist, exactly one is primary, and the representative must agree with that primary owner.

A `dependency` edge waits for representative health; a `prerequisite` edge waits for representative exit 0. A `requirement` edge includes the module without ordering. E2E checks reachable long-running representatives and completed jobs. Secondary endpoint owners do not automatically need health unless a native internal Compose condition requires it.

Required representative health may be supplied by an enabled Compose healthcheck or inherited from the selected built or pulled image. Builder checks image metadata after preparation and before `up`; `healthcheck.disable: true` and image `HEALTHCHECK NONE` do not satisfy readiness. A timing-only Compose healthcheck may retain an inherited image test command.

Builder owns public ports, container names, shared graph networking and generated namespaces. Raw module `ports`, unsafe host/root mounts, host networking, extra profiles/includes/extends and conflicting ownership settings are rejected. Safe relative bind paths, named/anonymous volumes, internal networks, configs, secrets, and valid native internal dependencies are rebased or namespaced. Paths resolve from the authoring Compose file. An endpoint-less module is fully runnable when a requisite reaches it; it is not inert.
