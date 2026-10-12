# Customize an app stage with override Compose

Set a stage's `override-compose` path, for example `dev.override-compose: "compose/dev.yml"`. The file customizes only Builder's `services.app`; it is not a second application composition.

Useful fields include volumes, command, entrypoint, user, labels, app environment, healthcheck timing/retries, and explicit `services.app.build.args`. Preserve Builder's readiness test. Override env has higher precedence than build app env, but Builder-owned runtime values remain authoritative. Raw `${VAR}` values in this YAML retain Compose interpolation behavior.

The validator rejects extra services, ports, depends_on, network_mode ownership, container_name, privileged, profiles, extends, env_file, target/Dockerfile/context replacement, unsupported build keys, Builder-owned env conflicts, readiness test replacement/disable, and endpoint publication. Use endpoint declarations and mesh publish configuration for ports.

See the [full override contract](../reference/override-compose-contract.md).

## Related

- [build.json](../reference/build-json.md)
- [Environment precedence](../reference/environment-precedence.md)
- [Override Compose contract](../reference/override-compose-contract.md)
