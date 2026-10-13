# JSON schemas

`mesh.json` supports `dev`, `prod`, and `e2e` overlays only. A root `test` field is rejected, including an empty object and when `--skip-checks` is used. `build.json.test` remains supported. See [migration](../migration/v2.1-to-v2.2.md).

The package includes `schemas/build-schema.json` and `schemas/mesh-schema.json`. Add the relevant schema URI as the `$schema` value in your JSON file to enable editor completion and structural validation. When working from this repository, the local files are in the `schemas/` directory.

Schemas catch shapes, types, ranges, and identifier constraints. They do not express every effective-stage rule, endpoint-reference resolution, lifecycle cycle, healthcheck requirement, or publication collision. Use `builder check` and `builder mesh check` as well; the prose references explain the semantics.

## Related

- [build.json](build-json.md)
- [mesh.json](mesh-json.md)
- [Validate before running](../guides/validate-before-running.md)
