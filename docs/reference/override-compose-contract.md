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
