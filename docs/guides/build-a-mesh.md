# Build a mesh

Create a named `mesh.json` with `services.tester` and at least one `{ "source": "./services/api" }` entry. Each source has its own runnable `build.json`. Every effective source root starts in mesh dev/prod/global E2E; an ordinary node starts only when a requisite reaches it. Use `extends` for explicit local edge/env rewrites and `publish` for host access to reachable, capable endpoints. The global tester is a separate Compose runner. Start with the [complete mesh example](../../examples/fullstack/mesh.json) and [mesh reference](../reference/mesh-json.md).
