# Develop a service

Run a foreground dev environment with `builder service up dev`; Ctrl+C stops it. Add `-d` to run in the background and stop later with `builder service down dev`.

```bash
builder service up dev
builder service up dev -d
builder service up dev --debug
builder service up dev --dry-run
builder service up dev --skip-checks
builder service up dev -C ./services/api
```

`--debug` prints merged Compose YAML with secrets redacted. `--dry-run` compiles/checks without starting containers. `--skip-checks` skips preflight lint/policy checks; use it for diagnosis or speed, not as a substitute for valid configuration. `-C` selects a service project. `--full` integrates local dependencies; see [run with local dependencies](run-with-local-dependencies.md).

## Related

- [Service quickstart](../getting-started/service-quickstart.md)
- [CLI reference](../reference/cli.md)
- [Cleanup guide](clean-up-builder-resources.md)
