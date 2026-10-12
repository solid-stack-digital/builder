# Install Builder

Builder requires Node.js 20 or newer, Docker Engine with an accessible daemon, and Docker Compose 2.24.0 or newer. Install globally with either package manager:

```bash
pnpm add -g @solid-stack/builder
npm install -g @solid-stack/builder
```

The executable is `builder`; `solid-builder` is also installed as an alias. Verify installation:

```bash
builder --version
builder --help
```

`-V, --version` prints the version. `--verbose` adds detailed error context. `-h, --help` works at the root and command levels, for example `builder service up --help`.

If Docker is not found, install Docker Engine and ensure its CLI is on PATH. If the daemon is unavailable, start it and confirm your user can access it. If Compose is too old, upgrade the Docker Compose plugin to 2.24.0 or newer. See [Docker troubleshooting](../troubleshooting/docker-and-compose.md) and [CLI reference](../reference/cli.md).

## Related

- [Service quickstart](service-quickstart.md)
- [CLI reference](../reference/cli.md)
- [Docker troubleshooting](../troubleshooting/docker-and-compose.md)
