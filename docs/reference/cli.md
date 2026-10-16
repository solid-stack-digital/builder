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
