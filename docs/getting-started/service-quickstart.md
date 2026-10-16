# Run a standalone service

Use the complete V3 [docs-service fixture](../examples/docs-service/build.json) as a file tree: `build.json`, project `Dockerfile`, `e2e/Dockerfile`, `e2e/docker-compose.yml`, ordinary Compose modules, and selected `.docker/overrides` files. `services.main` and `services.tester` are required. The main Dockerfile has `dev`, `test`, `prod`; dev/prod have health. The tester is a separate selected runner.

From that directory run `builder check`, `builder service up dev`, `builder service down dev`, `builder service up dev --full`, `builder service up prod`, and `builder service up test`. Isolated dev starts main only. `--full` follows main requisites; prod is integrated. `test` runs unit then service E2E with strict cleanup between phases. `test-unit` and `test-e2e` are convenience phase commands. The [stage matrix](../reference/stage-matrix.md) shows exact targets and environment.

## Complete fixture

The following is `docs/examples/docs-service/build.json` (complete file). Its supporting files are in the same fixture tree.

```text
docs-service/
├── build.json
├── Dockerfile
├── server.mjs
├── compose/mock-backend.yml
├── overrides/prod.yml
└── e2e/{Dockerfile,docker-compose.yml,test.mjs}
```

<!-- example: docs-service/build.json -->
```json
{
  "name": "frontend",
  "services": {
    "main": {
      "endpoints": {
        "http": {
          "port": 3000,
          "publicPort": "AUTO",
          "primary": true,
          "scheme": "http"
        }
      },
      "requisites": {
        "backend": "dependency"
      },
      "env": {
        "BACKEND_URL": "http://localhost:8080"
      }
    },
    "backend": {
      "compose": "./compose/mock-backend.yml",
      "service": "backend",
      "endpoints": {
        "http": {
          "service": "backend",
          "port": 8080,
          "primary": true,
          "scheme": "http"
        }
      }
    },
    "tester": {
      "compose": "./e2e/docker-compose.yml",
      "service": "e2e-runner",
      "env": {
        "API_URL": "${main.endpoints.http.public_url}"
      }
    }
  },
  "prod": {
    "services": {
      "main": {
        "env": {
          "BACKEND_URL": "${backend.endpoints.http.network_url}"
        },
        "override-compose": "./overrides/prod.yml"
      }
    }
  },
  "e2e": {
    "services": {
      "main": {
        "env": {
          "TEST_KIND": "black-box"
        }
      }
    }
  }
}
```

`dev` and isolated unit use the source's safe base URL. `prod` and E2E select the mock backend reference and its health-gated requisite. The runner uses host networking to reach the main public URL.
