# Run a named mesh

The [complete docs-mesh fixture](../examples/docs-mesh/mesh.json) has a required `name`, `services.tester`, and source roots. Each source has its own complete build and tester. To replace frontend's local backend mock, `extends.main.requisites` prunes `source.backend`, adds `backend: dependency`, and `extends.main.env` rewrites the backend URL to `${backend.source.main.endpoints.http.network_url}`. The three steps are independent; a URL never creates an edge.

A source `publish` array uses source-relative selectors such as `main.endpoints.http`. Only already reachable, `publicPort`-capable endpoints may be selected. Run `builder mesh check`, `builder mesh up dev`, `builder mesh up prod`, or `builder mesh up test`; stop with `builder mesh down dev` or `prod`. `test` first tests base sources in isolation and then starts fresh global E2E. The public mesh `up` command has no E2E-only stage.

## Complete fixture

The following is `docs/examples/docs-mesh/mesh.json` (complete file). The fixture includes `services/frontend` and `services/backend` with their own complete builds, plus a global `e2e/docker-compose.yml` runner.

```text
docs-mesh/
├── mesh.json
├── services/frontend/{build.json,Dockerfile,compose/,overrides/,e2e/}
├── services/backend/{build.json,Dockerfile,e2e/}
└── e2e/{Dockerfile,docker-compose.yml,test.mjs}
```

<!-- example: docs-mesh/mesh.json -->
```json
{
  "name": "frontend-system",
  "services": {
    "tester": {
      "compose": "./e2e/docker-compose.yml",
      "service": "global-runner",
      "env": {
        "API_URL": "${frontend.source.main.endpoints.http.public_url}"
      }
    },
    "backend": {
      "source": "./services/backend"
    },
    "frontend": {
      "source": "./services/frontend",
      "publish": [
        "main.endpoints.http"
      ],
      "extends": {
        "main": {
          "requisites": {
            "source.backend": false,
            "backend": "dependency"
          },
          "env": {
            "BACKEND_URL": "${backend.source.main.endpoints.http.network_url}"
          }
        }
      }
    }
  }
}
```

The frontend local mock remains in its independently runnable source. The mesh prunes only its local edge; the real backend root supplies the integrated URL and healthy dependency.
