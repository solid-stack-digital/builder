# Feature spec V3.3.0: output modes (`--silent`, `--logfile`)

Status: normative for 3.3.0. Decisions were agreed in review on 2026-11-18.

## 1. Flags

Both are root (global) options, accepted before or after the subcommand (`builder --silent service up test` ≡ `builder service up test --silent`).

| Flag | Mode | Terminal | Log file |
|---|---|---|---|
| (none) | `normal` | Unchanged 3.2 behavior. No result line. | — |
| `--silent` | `silent` | Only the result line. | — |
| `--logfile <dir>` | `logfile` | Only the result line. | Everything that would have been printed, plus the result line. |

`--silent --logfile <dir>` together is allowed and equals `--logfile <dir>`.

## 2. Result line

The result follows the exit code: exit 0 ⇒ success, anything else (non-zero status or thrown error) ⇒ failure. Exit codes are unchanged from normal mode, except §4.

| Outcome | Stream | Exact text |
|---|---|---|
| success | stdout | `success` |
| failure, `silent` | stderr | `failure: <message>` |
| failure, `logfile` | stderr | `failure (see <absolute log path>)` |
| attached long-running stack is up (§4) | stdout | `running (press Ctrl-C to stop)` |

`<message>` is the error message with any leading `❌ ` removed and newlines collapsed to single spaces. A non-zero status without an error becomes `exited with code <N>`.

## 3. Log file

- `<dir>` must be a directory. It is resolved against the process cwd (not `-C`). It is created recursively if missing. If it exists and is not a directory, the command fails with exit 2 before running.
- File name: `<epoch-ms>-<pid>-<command>.log`, e.g. `1763452800123-48211-service-up-test.log`. `<command>` is the invoked command path plus its positional arguments, lowercased, with runs of characters outside `[a-z0-9]` replaced by `-` and trimmed. If empty, it is `builder`.
- The file is created exclusively (`wx`) with mode `0600`.
- Contents are the exact output with no redaction. The only change is that ANSI escape sequences are stripped, as any redirect would do. Builder's own lines and all child-process stdout/stderr (Docker, Compose, BuildKit, containers, check tools) are written in arrival order. Writes are synchronous so nothing is lost on `process.exit`.
- Capture happens at the child-process boundary, so it doesn't depend on the stack running in the containers.

## 4. Attached long-running workflows (`service|mesh up dev|prod` without `--detach`)

In `silent` and `logfile` modes Builder:
1. builds and pulls as normal
2. runs `compose up --no-build --detach --wait <services>`
3. prints `running (press Ctrl-C to stop)`
4. follows `compose logs --follow --no-color <services>` (to the file, or discarded) until it ends
5. tears the stack down as in normal attached mode

If the follow ends with status 130 (Ctrl-C), that counts as a clean stop and the result is `success` with exit 0, provided teardown succeeds. Normal mode is unchanged.

## 5. Live test logs (all modes)

Finite workflows that start detached and wait (the finite tester, and unit runs with local modules) follow the selected runner/main logs live with `compose logs --follow --no-color <runner>` while waiting. They no longer dump that service's logs after the run. The finite tester then dumps the remaining members' logs once (`compose logs --no-color <others>`).

## 6. Rejected combinations (exit 2, before any work)

| Combination | Message |
|---|---|
| `--silent`/`--logfile` with `service export env` | `--silent and --logfile cannot be used with service export env` |
| `--silent`/`--logfile` with `--dry-run --debug` | `--silent and --logfile cannot be used with --dry-run --debug` |

`--help`, `--version` and running with no arguments take priority and print normally. Guard errors and commander usage errors are printed the normal way, since output mode isn't established yet.

## 7. Known limits (document, don't solve)

- With `--detach`, the log ends at startup. Later container output is available from `docker compose logs`.
- A Compose `logging.driver` that disables `docker logs` (e.g. `none`) produces no container output to capture.

## 8. Library API

`createOutput(options, sinks?)` and `runWithOutput(output, fn)` are exported. Library calls outside `runWithOutput` use normal terminal output and never create log files.
