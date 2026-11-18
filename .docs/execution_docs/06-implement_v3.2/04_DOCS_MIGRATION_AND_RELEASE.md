# 04 — Spec, docs, migration guide, and release

Files touched:
- `.docs/specs_v3/feature_spec_v3.2.0.md` (new)
- `.docs/EXECUTION_MODEL.md`
- `docs/migration/v3.1-to-v3.2.md` (new)
- `tests/v3/support/docsManifest.ts`
- `docs/reference/build-json.md`, `docs/reference/stage-matrix.md`, `docs/reference/environment-precedence.md`
- `docs/concepts/stages.md`, `docs/concepts/local-dependencies.md`, `docs/concepts/testing-model.md`
- `docs/guides/run-with-local-dependencies.md`, `docs/guides/develop-a-service.md`
- `docs/troubleshooting/configuration-errors.md`, `docs/glossary.md`
- `docs/README.md`, `docs/getting-started/installation.md`, `README.md`
- `package.json`, `CHANGELOG.md`
- `tests/v3/documentation.test.ts`, `tests/v3/repositoryContract.test.ts`

Rules for every doc edit: replace exactly the quoted "old" text with the "new" text. Every ```json block added to `docs/` must be a complete, schema-valid `build.json`, because DOCS13 validates every one of them.

---

## Step 4.1 — Feature spec: create `.docs/specs_v3/feature_spec_v3.2.0.md`

````markdown
# Feature specification V3.2.0: isolated infra-mode overlay

**Status:** Approved. **Extends:** `spec_v3.0.0.md`, `feature_spec_v3.1.0.md`. **Implementation plan:** `.docs/execution_docs/06-implement_v3.2/`.

A service can start local helper modules (for example a dev database behind in-process mocks) in isolated runs without switching `main` to `INFRA_MODE=integrated`. Integrated runs never start those modules.

**S1. Field.** `build.json` stage overlays `dev` and `test` accept an optional key `on-inframode-isolated`. Its value is an object whose only allowed key is `services`. `services` maps service names to the same partial overlays a stage overlay accepts for `main` and ordinary services. `tester` is not allowed inside it. `on-inframode-isolated` is not allowed inside itself, at the root, in `services`, in `prod`, in `e2e`, or anywhere in `mesh.json`.

**S2. When it applies.** The block of the resolved stage applies exactly when the run's `INFRA_MODE` is `isolated`: `service up dev` without `--full` (block `dev.on-inframode-isolated`), `service up test-unit` and the unit phase of `service up test` (block `test.on-inframode-isolated`), and the per-source unit phase of `mesh up test` Phase 1 (each source's `test.on-inframode-isolated`). It never applies to `service up dev --full`, `service up prod`, `service up test-e2e`, `mesh up dev`, `mesh up prod`, or `mesh up test` Phase 2. `service export <stage>` and `builder check` compile the same effective configuration as the matching run.

**S3. Merge order.** Standalone: `base → stage → stage.on-inframode-isolated`. Merge rules are those of stage overlays: objects merge recursively, scalars and arrays replace, `requisites.<name>: false` removes an edge, an existing ordinary `compose` is immutable, a service introduced by the block must provide a complete `compose`, and `main` and `tester` must exist in base. Per-key origins point at `<stage>.on-inframode-isolated.services.<name>...`.

**S4. Isolated graph.** In an isolated run the active graph is the closure from `main` following (a) only those `main` requisite edges whose effective declaration comes from `on-inframode-isolated`, and (b) every requisite edge of each activated ordinary module. All other edges from `main` are dropped. Kept edges behave exactly as in integrated runs: `dependency` waits for health, `prerequisite` waits for exit 0, `requirement` includes without ordering; healthcheck and lifecycle validation apply.

**S5. Execution variables.** `EXEC_MODE` and `INFRA_MODE` for `main` are unchanged in every workflow; isolated runs keep `INFRA_MODE=isolated` even when modules are active.

**S6. References.** Endpoint references resolve against the active graph and the consumer's requisite closure, as in 3.1.0. A reference in the block to a module the block activates resolves. A reference outside the block to a module only the block activates fails in runs where that module is inactive (`outside effective requisite closure`).

**S7. Dormant declarations.** An ordinary module declared in base and reached only through the block is dormant in every other run: it does not start, publish ports, or appear in the Compose output. It is still structurally validated in every resolved stage.

**S8. Unit runner.** When the isolated `test` graph contains only `main`, `service up test-unit` runs exactly as in 3.1.0 (`up --build --abort-on-container-exit --exit-code-from main main`). When it contains active modules, Builder starts all active services detached, waits for `main` to exit, prints `main`'s logs, returns `main`'s exit code, and tears down everything.

**S9. Mesh.** `mesh.json` gains no field. Global mesh runs are integrated, so source blocks never apply there. Phase 1 of `mesh up test` runs each source's standalone test workflow, so each source's `test.on-inframode-isolated` applies in that source's unit phase.

**S10. Compatibility.** A configuration without `on-inframode-isolated`, or with an empty block, produces Compose output identical to 3.1.0 in every workflow.
````

## Step 4.2 — `.docs/EXECUTION_MODEL.md`

Old:

```
- `isolated` — no external dependency containers; application uses in-process stubs/mocks.
```

New:

```
- `isolated` — no external dependency containers; application uses in-process stubs/mocks. Only local helper modules declared through `dev`/`test` `on-inframode-isolated` (V3.2.0) may run beside main.
```

## Step 4.3 — Migration guide: create `docs/migration/v3.1-to-v3.2.md`

````markdown
# Migrate Builder 3.1.0 projects to 3.2.0

Builder 3.2.0 is additive. Existing 3.1.0 configuration stays valid and compiles to the same Compose output in every workflow. The release adds one optional block, `on-inframode-isolated`, inside the `dev` and `test` overlays of `build.json`. It lets an isolated run start local helper containers, such as a dev database behind in-process mocks, while `main` keeps `INFRA_MODE=isolated`.

## Upgrade in three steps

1. Change your pinned dependency on `@solid-stack/builder` from `3.1.0` to `3.2.0` and reinstall.
2. If a `build.json` sets `$schema` to a copied `build-schema.json`, point it at the installed package's `schemas/build-schema.json` again so editors accept the new key.
3. Run `builder check -C <service>`. Without the new block nothing else changes.

## When to adopt the block

| You do this in 3.1.0 | Use instead in 3.2.0 |
|---|---|
| Run `builder service up dev --full` only to get a local helper, accepting `INFRA_MODE=integrated` | Declare the helper edge in `dev.on-inframode-isolated` and run `builder service up dev` |
| Run a second process inside the `main` container as a dev helper | Move the helper to its own Compose module and activate it from `dev.on-inframode-isolated` |
| Keep a helper's endpoint reference out of `dev` values because isolated dev rejects it | Put the reference in the block next to the edge that activates the helper |
| Want unit tests to use the same helper | Add the edge to `test.on-inframode-isolated` |

## Add a helper to isolated dev

Declare the helper as an ordinary module in base. Nothing reaches it outside the block, so it stays dormant in `--full`, `prod`, E2E, and mesh runs. Declare the edge and the environment that refers to the helper inside the block:

```json
{
  "name": "web",
  "services": {
    "main": {
      "endpoints": { "http": { "port": 3000, "publicPort": 3000, "primary": true, "scheme": "http" } },
      "requisites": { "backend": "dependency" }
    },
    "backend": {
      "compose": "./compose/backend.yml",
      "endpoints": { "http": { "service": "backend", "port": 4000, "primary": true, "scheme": "http" } }
    },
    "devstore": {
      "compose": "./compose/devstore.yml",
      "endpoints": { "http": { "service": "devstore", "port": 3002, "primary": true, "scheme": "http" } }
    },
    "tester": { "compose": "./e2e/docker-compose.yml", "service": "runner" }
  },
  "dev": {
    "on-inframode-isolated": {
      "services": {
        "main": {
          "requisites": { "devstore": "dependency" },
          "env": { "DEV_STORE_URL": "${devstore.endpoints.http.network_url}" }
        }
      }
    }
  }
}
```

With this file:

| Command | Starts | `INFRA_MODE` |
|---|---|---|
| `builder service up dev` | `main`, then `devstore` health-gated before `main` | isolated |
| `builder service up dev --full` | `main`, `backend` | integrated |
| `builder service up prod` / `test-e2e` | `main`, `backend` | integrated |
| `builder service up test-unit` | `main` | isolated |

`backend` stays out of isolated dev. In an isolated run, only the block's edges count for `main`. To start a base target in isolated runs too, declare it again inside the block.

## Share the helper with unit tests

Add a `test` block. A module only the block uses can also be declared inside the block itself, as long as the declaration is complete:

```json
{
  "name": "web",
  "services": {
    "main": {
      "endpoints": { "http": { "port": 3000, "publicPort": 3000, "primary": true, "scheme": "http" } }
    },
    "tester": { "compose": "./e2e/docker-compose.yml", "service": "runner" }
  },
  "test": {
    "on-inframode-isolated": {
      "services": {
        "main": {
          "requisites": { "devstore": "dependency" },
          "env": { "DEV_STORE_URL": "${devstore.endpoints.http.network_url}" }
        },
        "devstore": {
          "compose": "./compose/devstore.yml",
          "endpoints": { "http": { "service": "devstore", "port": 3002, "primary": true, "scheme": "http" } }
        }
      }
    }
  }
}
```

When a unit run has active modules, Builder starts them detached, waits for `main` to exit, prints `main`'s logs, and returns `main`'s exit code. Unit runs without modules use the same command as 3.1.0.

## Rules

- The block is allowed only in `dev` and `test`. `builder check` rejects it in `prod`, `e2e`, at the root, inside `services`, and inside itself.
- The block accepts `main` and ordinary services, not `tester`.
- Merge order is `base → stage → stage.on-inframode-isolated`. The block wins on the same key.
- Modules activated by the block follow their own requisites as usual.
- `mesh.json` has no new field. Global mesh runs ignore source blocks. Phase 1 of `builder mesh up test` applies each source's `test` block during that source's unit phase.
- Keep references to block-only modules inside the block. A reference in base or a plain stage overlay fails in every run where the module is inactive.

See the [build.json reference](../reference/build-json.md#isolated-only-configuration) and the [stage matrix](../reference/stage-matrix.md).
````

## Step 4.4 — Register the page (`tests/v3/support/docsManifest.ts`)

Old:

```ts
  "docs/migration/v3.0-to-v3.1.md",
```

New:

```ts
  "docs/migration/v3.0-to-v3.1.md",
  "docs/migration/v3.1-to-v3.2.md",
```

## Step 4.5 — `docs/reference/build-json.md`

**4.5a.** Old:

```
| `<stage>.services.<name>` | Partial service overlay | Existing fields merge recursively; arrays and scalars replace; `false` removes a requisite. |
```

New:

```
| `<stage>.services.<name>` | Partial service overlay | Existing fields merge recursively; arrays and scalars replace; `false` removes a requisite. |
| `dev.on-inframode-isolated.services.<name>`, `test.on-inframode-isolated.services.<name>` | Partial `main` or ordinary overlay; no `tester` | Applied after the stage overlay, only in isolated runs. See [isolated-only configuration](#isolated-only-configuration). |
```

**4.5b.** Old:

```
This is a complete configuration file; its `compose/db.yml`, `e2e/docker-compose.yml`, and project Dockerfile must also exist. Keep external endpoint references out of isolated base/dev/test values unless an active path makes them valid.
```

New (the old paragraph with an extended last sentence, then a new section appended at the end of the file):

````
This is a complete configuration file; its `compose/db.yml`, `e2e/docker-compose.yml`, and project Dockerfile must also exist. Keep external endpoint references out of isolated base/dev/test values unless an active path makes them valid; put references to isolated-only modules inside `on-inframode-isolated`.

## Isolated-only configuration

`dev` and `test` may contain `on-inframode-isolated`, an overlay with the same `services` shape as a stage overlay, without `tester`. Builder merges it after the stage overlay, and only when the run is isolated: `service up dev` without `--full`, `service up test-unit`, and the unit phase of `service up test` and `mesh up test` Phase 1. In an isolated run, `main`'s requisites come only from this block; base and stage edges of `main` are still dropped. Modules it activates follow their own requisites, wait as usual, and `main` keeps `INFRA_MODE=isolated`. Integrated runs ignore the block, so a module reached only from it never starts there.

```json
{
  "name": "example-web",
  "services": {
    "main": {
      "endpoints": { "http": { "port": 3000, "publicPort": 3000, "primary": true, "scheme": "http" } },
      "requisites": { "backend": "dependency" }
    },
    "backend": {
      "compose": "./compose/backend.yml",
      "endpoints": { "http": { "service": "backend", "port": 4000, "primary": true, "scheme": "http" } }
    },
    "devstore": {
      "compose": "./compose/devstore.yml",
      "endpoints": { "http": { "service": "devstore", "port": 3002, "primary": true, "scheme": "http" } }
    },
    "tester": { "compose": "./e2e/docker-compose.yml", "service": "runner" }
  },
  "dev": {
    "on-inframode-isolated": {
      "services": {
        "main": {
          "requisites": { "devstore": "dependency" },
          "env": { "DEV_STORE_URL": "${devstore.endpoints.http.network_url}" }
        }
      }
    }
  }
}
```

`builder service up dev` starts `main` and `devstore`; `--full`, `prod`, and E2E start `main` and `backend`. See the [3.1 to 3.2 migration guide](../migration/v3.1-to-v3.2.md).
````

## Step 4.6 — `docs/reference/stage-matrix.md`

**4.6a.** Old:

```
| `service up dev` | dev | dev | dev | isolated | `.env.dev` | — |
```

New:

```
| `service up dev` | dev → `dev.on-inframode-isolated` | dev | dev | isolated | `.env.dev` | — |
```

**4.6b.** Old:

```
| `service up test-unit` | test | test | test | isolated | `.env.test` | — |
```

New:

```
| `service up test-unit` | test → `test.on-inframode-isolated` | test | test | isolated | `.env.test` | — |
```

**4.6c.** Append this paragraph at the end of the file, after a blank line:

```
An `on-inframode-isolated` block applies only in rows whose `INFRA_MODE` is isolated, including the unit phase of `service up test` and each source's unit phase in `mesh up test` Phase 1. In those runs `main`'s requisites come only from the block; `INFRA_MODE` stays isolated even when the block starts modules.
```

## Step 4.7 — `docs/reference/environment-precedence.md`

**4.7a.** Old:

```
| Standalone main | selected main dotenv → source base env → source stage env → selected main override env → Builder-owned variables |
```

New:

```
| Standalone main | selected main dotenv → source base env → source stage env → source `on-inframode-isolated` env (isolated runs only) → selected main override env → Builder-owned variables |
```

**4.7b.** Old:

```
| Ordinary module | each container's native Compose defaults/env_file → source base/stage env → mesh base/stage extends env |
```

New:

```
| Ordinary module | each container's native Compose defaults/env_file → source base/stage env → source `on-inframode-isolated` env (isolated runs only) → mesh base/stage extends env |
```

## Step 4.8 — `docs/concepts/stages.md`

Append to the end of the single paragraph, after `See the [stage matrix](../reference/stage-matrix.md).` and on the same line, separated by one space:

```
`dev` and `test` may also contain an `on-inframode-isolated` overlay that Builder merges last, only in isolated runs; see [isolated-only configuration](../reference/build-json.md#isolated-only-configuration).
```

## Step 4.9 — `docs/concepts/local-dependencies.md`

Append a new paragraph after a blank line:

```
Isolated runs start no ordinary module unless `dev` or `test` `on-inframode-isolated` adds a requisite from `main` to it. Such a local helper waits and is health-checked like any module, while main keeps `INFRA_MODE=isolated`. See [isolated-only configuration](../reference/build-json.md#isolated-only-configuration).
```

## Step 4.10 — `docs/concepts/testing-model.md`

Append to the end of the single paragraph, on the same line, separated by one space:

```
A `test.on-inframode-isolated` block can start local helper modules for the unit phase; Builder then waits for main's exit and returns its code.
```

## Step 4.11 — `docs/guides/run-with-local-dependencies.md`

Old:

```
`builder service up dev --full` and `prod` use the active graph; isolated dev does not start ordinary nodes.
```

New:

```
`builder service up dev --full` and `prod` use the active graph; isolated dev starts only the ordinary nodes that `dev.on-inframode-isolated` reaches. To run a local helper such as a dev database without leaving isolated mode, follow the [3.1 to 3.2 migration guide](../migration/v3.1-to-v3.2.md#add-a-helper-to-isolated-dev).
```

## Step 4.12 — `docs/guides/develop-a-service.md`

Old:

```
Use `--full` when local ordinary modules are needed; only the effective requisite closure starts.
```

New:

```
Use `--full` when local ordinary modules are needed; only the effective requisite closure starts. To keep isolated mode and still start a local helper, declare its edge in `dev.on-inframode-isolated` ([reference](../reference/build-json.md#isolated-only-configuration)).
```

## Step 4.13 — `docs/troubleshooting/configuration-errors.md`

Append a new paragraph after a blank line:

```
`on-inframode-isolated` is accepted only inside `dev` and `test`, may contain only `services`, and rejects `tester`. A module introduced by the block needs a complete `compose`. `outside effective requisite closure` for a block-only module means its reference sits outside the block, or the block lacks the requisite that activates it; move both into the same `<stage>.on-inframode-isolated.services.main`.
```

## Step 4.14 — `docs/glossary.md`

Append a new paragraph after a blank line:

```
An **isolated overlay** is the `on-inframode-isolated` block of `dev` or `test`. Builder merges it last and only in isolated runs; its `main` requisites are the only main edges an isolated run follows.
```

## Step 4.15 — Version strings

Each pair replaces one exact occurrence.

**4.15a.** `package.json`. Old:

```
"version": "3.1.0",
```

New:

```
"version": "3.2.0",
```

**4.15b.** `README.md`. Old:

```
Builder 3.1.0 compiles
```

New:

```
Builder 3.2.0 compiles
```

**4.15c.** `README.md`. Old:

```
Main services can declare stage-aware Docker `buildArgs`.
```

New:

```
Main services can declare stage-aware Docker `buildArgs`, and isolated runs can start local helper modules through `on-inframode-isolated`.
```

**4.15d.** `README.md`. Old:

```
The source package declares version 3.1.0.
```

New:

```
The source package declares version 3.2.0.
```

**4.15e.** `docs/README.md`. Old:

```
Builder 3.1.0 uses explicit service graphs and supports first-class main-service Docker build arguments.
```

New:

```
Builder 3.2.0 uses explicit service graphs, supports first-class main-service Docker build arguments, and lets isolated runs start local helper modules.
```

**4.15f.** `docs/getting-started/installation.md`. Old:

```
declares `@solid-stack/builder` 3.1.0
```

New:

```
declares `@solid-stack/builder` 3.2.0
```

**4.15g.** `docs/getting-started/installation.md`. Old:

```
establish that 3.1.0 is already available
```

New:

```
establish that 3.2.0 is already available
```

## Step 4.16 — Migration links

**4.16a.** `README.md`. Old:

```
[Upgrade from Builder 3.0.0](docs/migration/v3.0-to-v3.1.md)
```

New:

```
[Upgrade from Builder 3.0.0](docs/migration/v3.0-to-v3.1.md)

[Upgrade from Builder 3.1.0](docs/migration/v3.1-to-v3.2.md)
```

**4.16b.** `docs/README.md`. Old:

```
Existing 3.0.0 projects can use the [3.1 build arguments guide](migration/v3.0-to-v3.1.md).
```

New:

```
Existing 3.0.0 projects can use the [3.1 build arguments guide](migration/v3.0-to-v3.1.md). Existing 3.1.0 projects can use the [3.2 isolated overlay guide](migration/v3.1-to-v3.2.md).
```

**4.16c.** `README.md` workflow paragraph. Old:

```
`builder service up dev --full` includes the effective requisite closure.
```

New:

```
`builder service up dev --full` includes the effective requisite closure; `dev.on-inframode-isolated` can add local helpers to plain isolated dev.
```

## Step 4.17 — `CHANGELOG.md`

Insert directly after the first line `# Changelog` and its following blank line:

```
## 3.2.0 (source tree; publication not implied)

### Added

- Optional `on-inframode-isolated` overlay in `build.json` `dev` and `test` stages. Builder merges it last and only in isolated runs, so `service up dev`, `service up test-unit`, and the unit phase of `mesh up test` can start local helper modules while main keeps `INFRA_MODE=isolated`. Integrated runs ignore it.
- `service up test-unit` waits on main's exit and returns its code when the isolated graph contains modules; main-only unit runs are unchanged.
- [3.1.0 to 3.2.0 migration guide](docs/migration/v3.1-to-v3.2.md).

### Compatibility

- Configurations without the block compile to the same Compose output as 3.1.0.

```

Do not add a `.changeset/` file (D-ISO-10).

## Step 4.18 — Docs and version tests

**4.18a.** `tests/v3/documentation.test.ts`, in `[DOCS11]`. Replace `expect(pkg.version).toBe("3.1.0")` with `expect(pkg.version).toBe("3.2.0")` and `toContain("source package declares version 3.1.0")` with `toContain("source package declares version 3.2.0")`.

**4.18b.** `tests/v3/documentation.test.ts`. Directly after the `[DOCS12]` test line, insert:

```ts
 it("[DOCS13] isolated overlay reference and 3.2 migration examples use the strict schema",()=>{const reference=blocks(read("docs/reference/build-json.md"));expect(reference).toHaveLength(2);expect(buildJsonSchema.safeParse(reference[1]).success).toBe(true);const migration=blocks(read("docs/migration/v3.1-to-v3.2.md"));expect(migration).toHaveLength(2);for(const block of migration)expect(buildJsonSchema.safeParse(block).success).toBe(true);expect(read("docs/reference/stage-matrix.md")).toContain("dev → `dev.on-inframode-isolated`");});
```

**4.18c.** `tests/v3/repositoryContract.test.ts`, in `[PKG05]`. Replace `expect(pkg.version).toBe("3.1.0")` with `expect(pkg.version).toBe("3.2.0")`.

## Step 4.19 — Final gate

```bash
pnpm build:schemas && git diff --exit-code schemas/mesh-schema.json
pnpm test
node dist/bin.js --version   # 3.2.0
```

`pnpm test` must pass and finish within the 180 s warm budget. If the budget fails only because of the three new Docker tests, report the measured durations; do not change the budget.
