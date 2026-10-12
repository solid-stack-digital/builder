# CLI reference

Executable: `builder` (package alias: `solid-builder`). The current directory is the default project directory unless `-C, --project-dir` is supplied.

## Global flags and command groups

| Syntax | Behavior |
|---|---|
| `builder -V`, `builder --version` | Print the installed version. |
| `builder --verbose` | Include verbose errors/stack traces. |
| `builder -h`, `builder --help` | Show root or command help. |

`builder service` groups one-service commands; `builder service export` groups exports; `builder mesh` groups multi-service commands. These are command namespaces, not runtime modes. Add `--help` at any group/command to inspect its syntax.

## Validate a service

```text
builder check [-C, --project-dir <dir>]
```

Directory defaults to the current working directory. Checks the service's configuration and infrastructure/Dockerfile contract. See [validation guide](../guides/validate-before-running.md).

## `builder service up [stage]`

The default stage is `dev`. Accepted CLI stages are `dev`, `prod`, `test`, `test-unit`, and `test-e2e`. `test-unit` uses JSON overlay `test`; `test-e2e` uses JSON overlay `e2e`.

| Flag | Meaning / stage scope | Example |
|---|---|---|
| `--debug` | Print merged Compose YAML (secrets redacted). Useful in any compilable stage. | `builder service up dev --debug` |
| `-d, --detach` | Run long-lived app composition in background; finite test flows remain test-runner workflows. | `builder service up dev -d` |
| `--dry-run` | Compile/check without starting containers. | `builder service up prod --dry-run` |
| `--skip-checks` | Skip preflight hadolint/conftest checks; configuration compilation still applies. | `builder service up dev --skip-checks` |
| `--silence-warnings` | Suppress non-critical warning hints where supported. | `builder service up dev --silence-warnings` |
| `--full` | For `dev`, integrate declared endpoint-bearing local dependencies. | `builder service up dev --full` |
| `-C, --project-dir <dir>` | Select service project; default cwd. | `builder service up dev -C ./services/api` |

`--full` is specifically a dev integration switch; prod and service E2E already integrate their effective local dependencies. `test` runs unit first, then E2E only on success.

## `builder service down [stage]`

Default is `dev`; accepted stages: `dev`, `prod`, `test`, `test-unit`, `test-e2e`.

| Flag | Meaning |
|---|---|
| `-v, --volumes` | Remove declared named volumes for the selected service project; data can be destroyed. |
| `-C, --project-dir <dir>` | Service project directory; default cwd. |
| `--debug` | Print merged Compose YAML when it can be compiled. |

For `test`, teardown covers resources associated with the test pipeline. Example: `builder service down test -C ./services/api`.

## `builder service export env [stage]`

Stage is omitted to export all `dev`, `prod`, `test`, `e2e`, or choose exactly one. `test-unit` and `test-e2e` are not export stage names.

| Flag | Meaning |
|---|---|
| `-C, --project-dir <dir>` | Service project directory; default cwd. |
| `--full` | Compile dev export with local dependencies integrated. |
| `--silence-warnings` | Suppress non-critical URL-templating warnings. |

Default files are `.env.dev`, `.env.prod`, `.env.test`, `.env.e2e`. If a target exists, an interactive prompt asks to overwrite; declining lets you choose another relative filename. Non-interactive overwrite requires selecting a different name. Exports can contain secrets; keep them out of version control.

## Mesh commands

`builder mesh check [-C, --project-dir <dir>] [--require-tester]` validates mesh/services; `--require-tester` requires root `mesh.json.tester`.

`builder mesh up [stage]` defaults to `dev`; accepts `dev`, `prod`, `test`, `test-unit`, `test-e2e`. `test-unit` uses test overlays and isolated per-service runs; `test-e2e` uses e2e overlays and global tester; `test` runs unit then global E2E.

| Flag | Meaning / scope | Example |
|---|---|---|
| `--debug` | Print compiled YAML with secret redaction. | `builder mesh up dev --debug` |
| `-d, --detach` | Detach long-running mesh composition. | `builder mesh up prod -d` |
| `--dry-run` | Compile and validate without starting containers. | `builder mesh up test-e2e --dry-run` |
| `--skip-checks` | Skip preflight checks invoked by up; not a configuration repair. | `builder mesh up dev --skip-checks` |
| `--silence-warnings` | Accepted by CLI help, but current mesh command does not forward it to execution; it has no observable warning-suppression effect. | `builder mesh up dev --silence-warnings` |
| `-C, --project-dir <dir>` | Mesh project containing `mesh.json`; default cwd. | `builder mesh up dev -C ./system` |

`builder mesh down [stage]` defaults to `dev`. Runtime accepts `dev`, `prod`, `test`, `test-unit`, and `test-e2e`; current help text omits `test-unit`, but the handler accepts it.

| Flag | Meaning |
|---|---|
| `-v, --volumes` | Remove mesh-declared named volumes; persistent data may be destroyed. |
| `-C, --project-dir <dir>` | Mesh project directory; default cwd. |
| `--debug` | Print compiled YAML where available. |

## `builder prune`

`builder prune` removes stopped containers and unused networks. `builder prune --volumes` also prunes dangling anonymous volumes; this can remove data. It is broader than a project-specific `down` operation.

## Command examples

```bash
builder check -C ./services/api
builder service up dev -C ./services/api
builder service up dev -d --debug -C ./services/api
builder service up dev --full -C ./services/api
builder service up prod -C ./services/api
builder service up test-unit -C ./services/api
builder service up test-e2e -C ./services/api
builder service up test -C ./services/api
builder service export env -C ./services/api
builder service export env dev --full -C ./services/api
builder service down dev -C ./services/api
builder service down test -v -C ./services/api
builder mesh check -C ./system
builder mesh check --require-tester -C ./system
builder mesh up dev -C ./system
builder mesh up prod -C ./system
builder mesh up test-unit -C ./system
builder mesh up test-e2e -C ./system
builder mesh up test -C ./system
builder mesh down dev -C ./system
builder mesh down test -C ./system
builder mesh down test-unit -C ./system
builder prune
builder prune --volumes
```

## Related

- [Installation](../getting-started/installation.md)
- [Stage matrix](stage-matrix.md)
- [Cleanup guide](../guides/clean-up-builder-resources.md)
