# Clean up Builder resources

`builder mesh down test` cleans each root service’s standalone unit/E2E projects, then the global E2E project. It uses root paths and saved project identities, not stage overlays. `mesh down test-unit` was removed; recover a service’s saved legacy test project with `builder service down test-unit -C <service>`. If root configuration is invalid, saved root cleanup remains available, but child paths cannot be discovered: run service down in each affected service directory. Failed teardown preserves recovery state.

Stop one project with `builder service down [stage]` or `builder mesh down [stage]`. Add `-v, --volumes` to remove named volumes declared for that project; this destroys persisted data in those volumes.

```bash
builder service down dev
builder mesh down test
builder prune
builder prune --volumes
```

`builder prune` removes stopped containers and unused networks. `--volumes` additionally prunes dangling anonymous volumes, which can remove data. Use project-specific `down` for a known environment; use `prune` for stale stopped resources or unused networks left across projects.

## Related

- [CLI reference](../reference/cli.md)
- [Docker troubleshooting](../troubleshooting/docker-and-compose.md)
- [Local dependencies](../concepts/local-dependencies.md)
