# CLI reference (V3)

The installed package exposes `builder` and `solid-builder`. Use `-C <dir>` to select a project directory; otherwise commands use the current directory. `--dry-run` compiles and validates without starting Docker. It cannot prove runtime health, successful jobs or tester connectivity. `--skip-checks` skips Hadolint/Conftest preflight, not schema, graph or Compose validation.

| Command | Meaning |
|---|---|
| `builder check [-C dir]` | Check a standalone source. |
| `builder service up dev [--full] [-d] [--dry-run] [-C dir]` | Isolated dev by default; `--full` includes effective requisites. |
| `builder service up prod [-d] [--dry-run] [-C dir]` | Integrated production main. |
| `builder service up test [-C dir]` | Unit, strict cleanup, then service E2E. |
| `builder service up test-unit [-C dir]` | Only the unit phase, main target `test`. |
| `builder service up test-e2e [-C dir]` | Only service E2E, main target `prod`. |
| `builder service down [dev\|prod\|test\|test-unit\|test-e2e] [-C dir]` | Stop saved standalone runtime. Check `--help` for volume options. |
| `builder mesh check [-C dir]` | Check mesh and sources. `--require-tester` remains a redundant compatibility flag because V3 already requires a tester. |
| `builder mesh up dev\|prod\|test [-d] [--dry-run] [-C dir]` | Integrated mesh; `test` runs source tests then global E2E. |
| `builder mesh down [dev\|prod\|test] [-C dir]` | Stop saved mesh runtime. |
| `builder service export env [dev\|prod\|test\|e2e] [-C dir] [--full]` | Export resolved main environment; no tester export. |
| `builder prune [--volumes] [--dry-run]` | Prune only stopped Builder-labelled containers and unused Builder-labelled networks; `--volumes` adds labelled volumes. Use project-specific `down` for project cleanup. |

`up` also accepts `--debug`, `--skip-checks`, and `--silence-warnings` where shown by `--help`. Detached mode is for long-lived dev/prod, not test workflows. There is no public `mesh up test-e2e` or `mesh up test-unit`. `test-unit` and `test-e2e` never select matching Dockerfile targets; see the [stage matrix](stage-matrix.md). `down` may retain compatibility phase names to recover saved runs even when `up` no longer accepts them.

## Output modes

Two global flags control what reaches the terminal. Both work before or after the subcommand (`builder --silent service up test` and `builder service up test --silent` are the same).

| Flag | Terminal | Log file |
|---|---|---|
| (none) | Full output, as before. | None. |
| `--silent` | Only the result line. | None. |
| `--logfile <dir>` | Only the result line. | Everything Builder, Docker, Compose, BuildKit and your containers print, plus the result line. |

`--silent --logfile <dir>` is the same as `--logfile <dir>`. Exit codes do not change: exit 0 prints `success` on stdout, any failure prints a line on stderr. That line is `failure: <reason>` with `--silent`, or `failure (see <log path>)` with `--logfile`.

`<dir>` must be a directory, resolved against the current directory (not `-C`), and is created if missing. Each run writes a new file named `<epoch-ms>-<pid>-<command>.log`, for example `1763452800123-48211-service-up-test.log`. The file is readable only by its owner and contains the output as printed, with no redaction; only terminal color codes are removed. Capture happens at the process boundary, so output from any language or framework inside your containers is included.

Attached `up dev` or `up prod` (without `-d`) in these modes waits until the services are healthy, prints `running (press Ctrl-C to stop)`, then keeps following container logs. Pressing Ctrl-C stops and removes the stack and reports `success`. Test workflows stream the tester's (or unit main's) logs live while they run.

These combinations are rejected with exit code 2 before anything runs, because their purpose is terminal output or an interactive prompt:

| Combination | Why |
|---|---|
| `--silent` or `--logfile` with `service export env` | Export may prompt before overwriting files. |
| `--silent` or `--logfile` with `--dry-run --debug` | The compiled YAML is the output. |

`--help` and `--version` always print normally.

Limits: with `-d`, the log ends once the stack has started; use `docker compose logs` for later output. A Compose `logging.driver` that disables `docker logs` (such as `none`) leaves nothing to capture.
