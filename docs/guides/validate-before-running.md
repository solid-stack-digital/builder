# Validate before Docker runs

JSON Schemas catch structure. `builder check` and `builder mesh check` inspect cross-file contracts and declared assets. `builder service up ... --dry-run` or `builder mesh up ... --dry-run` compiles active stages, graph, Compose and endpoint values without starting runtime or writing state. Only surviving env values are reference-checked; a shadowed invalid value is ignored. `--skip-checks` skips external Hadolint/Conftest, not semantic validation. Live tests still establish health, job exit and network reachability. See [schemas](../reference/json-schemas.md).
