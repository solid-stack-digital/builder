# Main Compose override contract

Select one file with `services.main.override-compose` or `<stage>.services.main.override-compose`. The final selected file replaces an earlier path. It must contain only `services.main` for the override, not `services.app` or extra services. Paths inside the file are resolved from its authoring directory, including mesh-authored overrides.

```yaml
services:
  main:
    build:
      args:
        FEATURE: "on"
    environment:
      LOG_LEVEL: debug
    volumes:
      - ./src:/workspace/src:ro
```

This is an override fragment, not a complete generated Compose file. Safe build arguments, environment, mounts and compatible runtime settings are retained. Builder protects build context/Dockerfile/target, endpoints and ports, depends_on lifecycle, names, graph networks, and health. In mesh, `extends.main.env` wins over a selected override's environment. A prod override and E2E override do not stack; consolidate needed settings into the selected file.

The override's `services.main.build.args` may be a mapping or a list of `KEY=VALUE` strings. Builder normalizes the list to a string map. In standalone composition, these args win over `services.main.buildArgs` from base and stage configuration. In mesh composition, `extends.main.buildArgs` wins over the source override. A lower-precedence endpoint reference that loses on the same key is skipped. Keys beginning `BUILDER_` are reserved in both locations.
