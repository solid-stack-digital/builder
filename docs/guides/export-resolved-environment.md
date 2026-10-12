# Export the resolved app environment

Run:

```bash
builder service export env [stage]
```

The accepted stage names are exactly `dev`, `prod`, `test`, and `e2e`. Omit the stage to export all four into `.env.dev`, `.env.prod`, `.env.test`, and `.env.e2e`. `test-unit` and `test-e2e` are CLI execution names, not export stages.

Options: `-C, --project-dir <dir>` selects the service project; `--full` compiles dev with local dependencies integrated; `--silence-warnings` suppresses non-critical URL-templating hints. Values include resolved endpoint references and reflect the effective app environment. Existing files prompt for overwrite in an interactive terminal; declining permits an alternate filename. Exported files may contain secrets; keep them ignored by version control.

## Related

- [Environment](../concepts/environment.md)
- [Environment precedence](../reference/environment-precedence.md)
- [CLI reference](../reference/cli.md)
