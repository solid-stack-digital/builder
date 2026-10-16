# JSON Schemas

The package includes [build-schema.json](../../schemas/build-schema.json) and [mesh-schema.json](../../schemas/mesh-schema.json). Set `$schema` in a configuration file to the corresponding installed schema URI or local file path for editor completion. The source of truth is the V3 Zod contract; `pnpm build:schemas` regenerates the checked-in JSON Schema files.

Structural schema validation checks keys, types, required `name`/`services.main`/`services.tester`, stages and declaration shapes. It cannot prove cross-file paths, endpoint reachability, health, port availability or selected Compose runner behavior. Run `builder check`, `builder mesh check`, and the appropriate `--dry-run` for effective validation. A live test is needed to verify actual engine health and connectivity.
