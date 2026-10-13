# Stage override Compose contract

Set `<stage>.override-compose` to a Compose YAML file that customizes the Builder-owned app container. It may define `services.app` and app-consumed top-level resources. It cannot add another runtime composition or take control of endpoint/readiness ownership.

| Supported use | Notes |
|---|---|
| `volumes` | App bind/named/anonymous mounts; app-owned resources may be declared. |
| `command`, `entrypoint`, `user`, `labels` | Container-local customization. |
| `build.args` | Explicit build-time arguments; runtime env does not become build args. |
| `environment` | Raw Compose environment interpolation; Builder-owned values remain authoritative. |
| Healthcheck timing/retries | May tune timing while preserving Builder readiness test. |

Rejected: root-level `include` or other unsupported composition keys; extra services; raw `ports`; `depends_on`; `network_mode`; `container_name`; `privileged`; profiles; `extends`; `env_file`; Dockerfile or target replacement; changing Builder build context; unsupported build keys; Builder-owned env conflicts; disabling/replacing the readiness test; or declaring endpoint publication.

Builder scopes app-owned named resources to the Compose project. Source definitions with an explicit `name` receive a project-scoped name in the generated composition. Declare `external: true` when the app must refer to an existing shared resource; Builder preserves that external identity. Existing data under a formerly fixed owned volume name is not moved automatically.

File-backed app configs and secrets in an active override must point to existing regular files. Their relative paths are interpreted from the service project root, even when the override YAML is in a subdirectory. An inactive stage's override is not checked during compilation.

## Related

- [Customize a stage](../guides/customize-a-stage-with-override-compose.md)
- [Environment precedence](environment-precedence.md)
- [build.json](build-json.md)
