## Audit result

The V2 architecture is **substantially implemented, but it is not yet fully conformant** with `SPECS_V2.md`, `BUILD_JSON_DOCS.md`, and `MESH_JSON_DOCS.md`. I found **9 concrete implementation bugs**. I am not counting older V1 issues that the current code has already fixed.

This was a static code audit of the supplied repository export rather than an executed repository test run, so the regression tests below are specifically designed to expose the defects and should be added before fixes are applied.

The broad architecture is correct: V2 schemas, explicit endpoint ownership, effective-stage resolution, atomic dependencies, mesh substitution, publication, reference resolution, `service_healthy` lifecycle, and the isolated/integrated stage model are all present. The remaining defects are mostly edge interactions rather than a fundamentally wrong implementation. The V2 spec explicitly requires atomic dependency composition, consistent namespacing, health-gated ownership, and no `service_started` fallback. Pasted text(2) Pasted text(2)

### Actual bug reports

1. **HIGH — `override-compose` corrupts development bind mounts and named-volume references.** `BUILD_JSON_DOCS.md` explicitly says development bind mounts are a normal use of `override-compose` and even gives `.:/app` and `/app/node_modules` as the canonical example. Pasted text(2) The current `validateAndPrepareAppOverride()` treats every string in `services.app.volumes` as if the entire string were a top-level resource name. It therefore prefixes something such as `./src:/src:ro` with `app-override--dev--volume--...`; for a named volume such as `cache:/cache`, the reference set contains `cache:/cache`, so the top-level definition named `cache` is incorrectly considered unused. Pasted text(2)

   **Test that must fail before the fix:** extend `tests/conformance/03-stages.test.ts` with one case using `services.app.volumes: ["./src:/src:ro"]` and assert the final app still contains that bind mount, then another with top-level `volumes: { cache: {} }` and `services.app.volumes: ["cache:/cache"]`, asserting compilation succeeds and only the source `cache` is namespaced. The current STG-023 test merely checks that `volumes` is defined, so it misses the corruption.

   **Expected behavior:** bind paths remain bind paths, options such as `:ro` remain intact, anonymous mounts remain anonymous, and only actual named-volume sources are rewritten.

   **Fix:** create a Compose-aware volume parser shared with dependency namespacing. For short syntax, distinguish bind source, named volume, and anonymous volume and preserve target/options. For long syntax, rewrite `source` only when `type: volume` and the source corresponds to an override-owned top-level volume. Never blindly prefix the complete mount string.

2. **HIGH — mesh compilation discards networks supplied by an app override.** The standalone compiler prepares the override and attempts to merge its network attachments, but `compileMeshComposition()` later does an unconditional `app.networks = networks`, replacing whatever the fragment already had with only `mesh` and the private Builder network. Pasted text(2) The intended V2 composition contract is to union override networks with Builder-required networks rather than detach one set from the other. Pasted text(2)

   **Test that must fail before the fix:** create service `api` whose dev `override-compose` has top-level `networks: { tooling: {} }` and `services.app.networks: { tooling: {} }`. Put it in a mesh and compile dev. Assert `compose.services.api.networks` contains both `mesh` and `app-override--dev--network--tooling`. It currently loses the tooling network.

   **Expected behavior:** Builder-required mesh/private networks and user-permitted app override networks coexist.

   **Fix:** normalize the fragment's existing app networks into map form, then merge Builder networks into them:
   ```ts
   app.networks = {
     ...normalizeNetworks(app.networks),
     mesh: null,
     ...(privateName ? { [privateName]: null } : {}),
   };
   ```
   Do not replace the map.

3. **HIGH — the compiler does not fail when the selected application Dockerfile is missing.** The conformance specification explicitly requires removing/renaming the default Dockerfile to produce a compile-time missing-file failure, and says declared required artifacts must fail before runtime. Pasted text(2) Pasted text(2) `compileServiceComposition()` currently calls `resolveInsideProject()` for the Dockerfile but never checks that the returned file exists. Pasted text(2) `checkDockerfile()` does contain the correct existence check, but that is a separate checker path. Pasted text(2)

   **Test that must fail before the fix:** create a normal `fixture({ app: {} })` without a `Dockerfile` and assert `compileService("dev", root)` throws a `ConfigError` containing `Dockerfile`. It currently compiles a Compose document.

   **Expected behavior:** both an omitted default Dockerfile and an explicitly configured missing Dockerfile fail immediately without Docker being invoked.

   **Fix:** make Dockerfile resolution a shared helper that does boundary validation, `existsSync`, and `statSync(...).isFile()`, and use it from both the compiler and checker. After this fix, the generic conformance fixture should create a valid default V2 Dockerfile unless a test intentionally exercises a missing/invalid Dockerfile.

4. **HIGH — `mesh up dev`, `mesh up prod`, and `mesh up test-unit` bypass the V2 Dockerfile contract checker.** V2 requires the `dev`, `test`, `test-e2e`, and `prod` targets, forbids `EXPOSE`, and requires healthchecks for `dev` and `prod`. Pasted text(2) The mesh command's pre-action only calls `checkDependencies()`. Pasted text(2) The up handler dispatches directly to `runMeshDev`, `runMeshProd`, and `runMeshTestUnit`; dev/prod compile and start without `checkMesh()`. Only `runMeshTestE2e()` currently invokes `checkMesh()` when checks are enabled. Pasted text(2) Pasted text(2) Pasted text(2)

   **Test that must fail before the fix:** make a mesh containing a service whose Dockerfile has the expected target names but lacks the required dev/prod healthcheck, then invoke `handleMeshUp("dev", { dryRun: true, skipChecks: false })`. Spy/mock the process layer so Docker isn't involved. Assert the command rejects during V2 contract validation. Current dev dispatch reaches compilation/dry-run without the policy check.

   **Expected behavior:** ordinary mesh commands enforce the same application contract as standalone service commands unless `--skip-checks` was explicitly supplied.

   **Fix:** put stage-aware mesh preflight once at the mesh-up command boundary rather than separately inside runners. `test-e2e`/aggregate `test` should require the tester; dev/prod/test-unit should not. Remove the existing duplicate E2E checker call after centralizing it.

5. **MEDIUM-HIGH — a dependency-owned customized implicit `default` network is not preserved when namespaced.** V2 allows dependency Compose files to own internal networks and requires dependency-owned objects and their relevant references to be namespaced consistently. Pasted text(2) The namespacer rewrites `service.networks` only if the service explicitly has a `networks` field. A service relying on Compose's implicit `default` attachment therefore remains on the final composition's global default network even if its original dependency Compose declared a customized `networks.default`. Pasted text(2)

   **Test that must fail before the fix:** use a dependency Compose with `networks: { default: { internal: true } }` and an endpoint owner with no explicit `networks`. Namespace the document and assert the renamed owner is attached to the generated `dep--db--network--default` network. Currently its `networks` stays undefined and the namespaced network becomes disconnected/unreferenced.

   **Expected behavior:** the dependency retains the semantics of its original implicit default network after being embedded into the larger composition.

   **Fix:** before renaming top-level `default`, identify dependency services that implicitly used it. Convert that implicit relationship into an explicit attachment to the namespaced default network. Builder can then additionally attach endpoint owners to its communication network as required.

6. **MEDIUM — dependency service-reference rewriting is incomplete for otherwise valid Compose constructs.** `SPECS_V2` says relevant internal dependency references must remain consistent after namespacing, describing `depends_on`, `links`, `network_mode: service:...`, `volumes_from`, named resources and networks as examples rather than defining them as the only possible references. Pasted text(2) Current rewriting handles precisely that small allowlist. Pasted text(2) Constructs such as same-file `extends.service`, `ipc: service:<name>`, or `pid: service:<name>` are neither rewritten nor rejected.

   **Test that must fail before the fix:** namespace a dependency containing services `base` and `owner` where `owner.extends.service = "base"`. Assert the result references the generated service name such as `dep--db--base`. The current document retains `"base"` after the service key itself has been renamed.

   **Expected behavior:** Builder must never emit stale references to pre-namespace dependency service keys.

   **Fix:** either support each legitimate internal service-reference form through one `rewriteServiceReference()` helper, or explicitly reject unsupported reference-bearing Compose constructs during validation. Silently accepting them and emitting a broken composition is the invalid option.

7. **HIGH — project-boundary protection can be bypassed through symlinks.** The specification requires the dependency Compose path to remain inside the service project boundary. Pasted text(2) `resolveInsideProject()` uses only lexical `path.resolve/path.relative` containment. Pasted text(2) `isPathInside()` likewise operates entirely on lexical paths. Pasted text(2) Consequently, `<project>/inside-link/dep.yml` passes even when `inside-link` is a symlink to a directory outside the project.

   **Test that must fail before the fix:** create a temporary project and a second external temp directory; symlink `<project>/escape` to the external directory; place `dep.yml` there; configure `"compose": "escape/dep.yml"` and assert compilation throws a project-boundary error. Current lexical validation accepts it.

   **Expected behavior:** the actual filesystem target, not merely the textual path, remains under the actual project root.

   **Fix:** canonicalize existing project root and target with `realpathSync`. For paths that do not exist yet, resolve the nearest existing ancestor via `realpath` and then append the remaining segments. Use the canonical containment function for Dockerfile, dependency Compose, override Compose, mesh service path, and tester Compose.

8. **MEDIUM — dependency host-root bind validation does not reject Windows drive roots.** V2 forbids dependency Compose from mounting the host root filesystem. Pasted text(2) The current validator recognizes only a source that normalizes exactly to `/`, and short syntax is parsed with `split(":")`. Pasted text(2) A long-form bind with `source: "C:\\"` therefore passes, while short Windows paths are ambiguous under the colon split.

   **Test that must fail before the fix:** pass `volumes: [{ type: "bind", source: "C:\\", target: "/host" }]` into `validateDependencyCompose()` and assert a host-root error. This is a pure unit test and works even when the tests themselves run on Linux.

   **Expected behavior:** `/`, `C:\`, `C:/`, and equivalent platform root forms are rejected consistently.

   **Fix:** create `isHostFilesystemRoot(source)` handling POSIX roots, Windows drive roots, and, if Windows support is intended, UNC share roots. Stop parsing short mount syntax with a raw first-colon split; use a drive-aware Compose mount parser.

9. **MEDIUM — mesh dev teardown leaks Builder-created anonymous `/app/node_modules` volumes.** The dev compiler creates `.:/app` plus anonymous `/app/node_modules`, including for mesh app fragments. Pasted text(2) When `removeVolumes` is false, teardown tries to remove anonymous volumes only from a service literally named `app`. Pasted text(2) Mesh app services, however, are named by their mesh keys such as `frontend`, `backend`, etc. `docker compose rm -f -v app` therefore removes none of those anonymous volumes.

   **Test that must fail before the fix:** mock the process runner, compile a dev mesh containing `frontend` and `backend`, and call `teardownCompose(yaml, meshDir, { removeVolumes: false })`. Assert its anonymous-volume cleanup targets `frontend` and `backend`, not `app`. Current code issues `rm -f -v app`.

   **Expected behavior:** Builder-owned anonymous volumes are deleted while persistent named dependency volumes survive ordinary dev/prod teardown.

   **Fix:** inspect the supplied Compose document for services containing anonymous volume mounts and run `docker compose rm -f -v <those-service-names>` before `down`. Do not hardcode a service name. If teardown operates only from persisted project state without YAML, persist the relevant generated service names in run state.

## Conformance suite: why it is so slow

The 384-scenario catalog itself is not the problem. In fact, the original test specification explicitly says to use the **lowest test layer capable of proving each invariant**: schema tests for shape, compiler tests for topology, Docker only for real runtime behavior, and CLI/E2E only for sequencing/black-box behavior. Pasted text(2) The suite intentionally contains 384 scenarios. Pasted text(2)

The current implementation violates that economy in several places. `06-service-runtime.test.ts` launches four complete Builder/Docker runs in `beforeAll` and allows 240 seconds. Pasted text(2) `11-system-runtime.test.ts` launches three complete mesh systems and allows 360 seconds. Pasted text(2) `docker-behavior.test.ts` has individual 90-second Docker tests. Pasted text(2) On top of that, the Dockerfile policy helper starts a fresh Conftest container for every call, and several stage-policy tests invoke it repeatedly. Pasted text(2) Pasted text(2) Finally, Vitest explicitly disables file parallelism globally. Pasted text(2)

I would restructure it like this:

| Suite | Default `pnpm test`? | Real Docker? | Target |
|---|---|---:|---:|
| Schema + stage-resolution conformance | Yes | No | ~2–5 s |
| Compiler/reference/substitution/publication conformance | Yes | No | ~5–15 s |
| Lifecycle/runner orchestration with mocked process runner | Yes | No | ~5–10 s |
| Dockerfile checker integration with mocked Conftest process | Yes | No | ~1–3 s |
| Small Docker smoke/acceptance suite | No | Yes | ~30–60 s warm |
| Full Docker behavioral acceptance | Release/nightly/manual | Yes | unrestricted |

That gives you a realistic **default conformance target of roughly 15–30 seconds**, with plenty of margin under one minute. A hard sub-minute guarantee is not realistic if real Docker image pulls/builds remain in the default suite; a cold Docker cache alone can exceed that.

### Exact test-suite changes I recommend

Keep the 384 scenario IDs, but make their primary tests deterministic whenever the behavior can be proven without Docker. In particular, `SVC-006/007/008` should test `runTest()` with `runTestUnit`/`runTestE2e` mocked; exit-code propagation can mock `runCompose`; cleanup can mock `teardownCompose`; lifecycle edge scenarios should inspect generated `depends_on`; publication should inspect generated port mappings; substitution should inspect compiled topology. This is exactly the layer selection the test specification already calls for. Pasted text(2)

Move `05-lifecycle-runtime.test.ts`, `06-service-runtime.test.ts`, `11-system-runtime.test.ts`, and `docker-behavior.test.ts` out of the default `tests/conformance` execution path into something like `tests/docker-acceptance/`. The catalog-coverage test currently scans `tests/conformance` and requires each of the 384 IDs exactly once, so first replace the runtime-numbered cases with fast equivalents before moving their heavyweight Docker counterparts. Pasted text(2)

For the Dockerfile Rego policy, do not launch one Conftest container per assertion. The fastest default approach is to mock the process boundary and verify that `checkDockerfileContract()` selects the correct policy and propagates Conftest failures. Keep the actual Rego semantic matrix in the Docker-acceptance suite. An alternative is one batched Conftest container invocation for all policy fixtures, but that makes a strict `<60s` guarantee dependent on Docker cache state.

Then change the ordinary Vitest configuration back to parallel file execution. The pure conformance fixtures use `mkdtemp` and compiler `validationMode: true`, so most files have no reason to be globally serialized. Pasted text(2) Keep only the Docker acceptance suite serial.

The scripts should conceptually become:

```json
{
  "test": "vitest run",
  "test:conformance": "vitest run tests/conformance",
  "test:docker": "vitest run --config vitest.docker.config.ts",
  "check": "pnpm typecheck && pnpm test:conformance",
  "check:full": "pnpm check && pnpm test:docker"
}
```

with the normal Vitest config excluding `tests/docker-acceptance/**` and allowing parallel test files. `test:docker` should be the release/nightly/manual acceptance gate.

The key distinction is: **do not reduce the specification coverage; reduce the number of times you prove the same invariant using an actual Docker daemon.** The current suite has very good coverage breadth, but its test-layer allocation is unnecessarily expensive.