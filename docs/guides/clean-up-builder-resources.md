# Clean up Builder resources

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
