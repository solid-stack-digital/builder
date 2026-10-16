# Solid Stack Builder V3

Builder 3.1.0 compiles a service's `build.json` or a system's `mesh.json` into Docker Compose. Services declare possible runtime modules; explicit **requisites** select which modules run and how they wait. Mesh sources stay independently runnable, with explicit `extends` rewrites when a real service replaces a local mock. Main services can declare stage-aware Docker `buildArgs`.

The source package declares version 3.1.0. This checkout does not imply that version has been published to a package registry. For a local checkout, run `pnpm install`, `pnpm build`, and `node dist/bin.js --version`. The package exposes both `builder` and `solid-builder` when installed. Node.js 20 or newer and Docker Engine with Compose are required for runtime commands.

[Builder V3 documentation](docs/README.md)

[Upgrade from Builder 2.2.0](docs/migration/v2.2-to-v3.0.md)

[Upgrade from Builder 3.0.0](docs/migration/v3.0-to-v3.1.md)

## Tests

Run `pnpm test` for the complete V3 verification suite. It runs non-Docker tests, typechecking, build and API checks first, then the three Docker acceptance tests. Docker tests require a prepared local fixture image; run `pnpm test:v3:prepare` once when the fixture is missing or stale. For a quick run without Docker, use `pnpm test:v3:fast`.

## A service

`build.json` (complete minimal configuration):

```json
{
  "name": "my-api",
  "services": {
    "main": {
      "endpoints": {
        "http": { "port": 3000, "publicPort": "AUTO", "primary": true, "scheme": "http" }
      }
    },
    "tester": { "compose": "./e2e/docker-compose.yml", "service": "runner" }
  }
}
```

Provide a project `Dockerfile` with `dev`, `test`, and `prod` targets. The `dev` and `prod` main images need a usable healthcheck. The tester is a separate Compose implementation; its selected `runner` determines the E2E result. A minimal `e2e/docker-compose.yml` is:

```yaml
services:
  runner:
    image: alpine:3.20
    command: ["sh", "-c", "exit 0"]
```

The [service quickstart](docs/getting-started/service-quickstart.md) gives a runnable tree. Run `builder check`, then `builder service up dev`; `builder service up dev --full` includes the effective requisite closure. `builder service up prod` uses the `prod` target and integrated graph. `builder service up test` runs isolated unit tests, cleans up, then runs service E2E with a production main and full graph.

| Workflow | Main target | Main execution mode | Infrastructure mode |
|---|---|---|---|
| `service up dev` | `dev` | `dev` | isolated |
| `service up dev --full` | `dev` | `dev` | integrated |
| `service up prod` | `prod` | `prod` | integrated |
| `service up test-unit` | `test` | `test` | isolated |
| `service up test-e2e` | `prod` | `prod` | integrated |
| `mesh up dev` / `prod` | `dev` / `prod` | same | integrated |

`test-unit` and `test-e2e` are standalone workflow names, not required Dockerfile targets.

## A mesh rewrite

A mesh has a required `name`, `services.tester`, and at least one source. To replace `frontend`'s local `backend` mock with a real `backend` source, remove the local edge and add the real one explicitly:

```json
"frontend": {
  "source": "./services/frontend",
  "extends": {
    "main": {
      "requisites": { "source.backend": false, "backend": "dependency" },
      "env": { "BACKEND_URL": "${backend.source.main.endpoints.http.network_url}" }
    }
  }
}
```

That is an overlay fragment at `mesh.json.services.frontend`; see the [complete mesh example](docs/getting-started/mesh-quickstart.md). The reference alone does not add the edge. Mesh endpoints are private unless `publish` selects an already reachable endpoint with `publicPort`.

`builder mesh up test` tests each base source independently and sequentially, then starts a fresh global E2E composition. The public mesh `up` stages are `dev`, `prod`, and `test`.

See the [configuration reference](docs/reference/build-json.md), [mesh reference](docs/reference/mesh-json.md), [CLI reference](docs/reference/cli.md), and [migration guide](docs/migration/v2.2-to-v3.0.md).
