Full audit: @solid-stack/builder (current snapshot)
I read the code statically and ran nothing. I haven't seen examples/, tsconfig.build.json, or your service Dockerfiles, so items marked (verify) need a quick check.
Corrections to my earlier messages
- The "Killing" lines. I said you must have pressed Ctrl+C twice. Your latest log shows Killing right after a single ^C. The new async code most likely causes that (see H1), so it is a bug in the tool, not user error.
- toComposePath and dot-directories. I said .docker/data would be parsed as a named volume. Compose treats any source starting with ., / or ~ as a path, so that case works. It is cosmetic (L1).
What is now solid
- resolveProjectDir is applied at every boundary.
- Argument-array runStep with stdin for hadolint, and pinned tool images.
- Zod-validated mesh.json with provider checks and cycle detection.
- ScriptError with cause and exitCode.
- registerService collision detection.
- Env-file handling in the templates.
- down commands and teardown in the foreground runners.
- Retry on down and stale-project cleanup before test runs.
The remaining problems are mostly in the new lifecycle code.
🔴 HIGH
H1. A single Ctrl+C is delivered twice, so Compose force-kills
Where: composeCleanup.ts (handleSignal), runCompose.ts.
Problem: In a terminal, Ctrl+C sends SIGINT to the whole foreground process group, which includes docker compose. Your handler then forwards SIGINT to the same child. Compose treats a second SIGINT as "force" and goes straight to Killing, so containers never get their graceful stop. Emulators, databases and anything that flushes on SIGTERM lose that chance. SIGHUP on terminal close has the same double delivery. Only a SIGTERM sent to the Node PID alone is single.
Fix: Put the child in its own process group, so the terminal signal reaches only Node, and forward each signal exactly once:
const child = spawn("docker", args, {
  cwd, stdio: ["pipe", "inherit", "inherit"],
  detached: process.platform !== "win32",   // own process group
});
A second user SIGINT is forwarded again, which is the intended "force" path. If you would rather not use detached, forward only SIGTERM and let the terminal deliver SIGINT and SIGHUP.
Verify: Run up dev, press Ctrl+C once, and confirm you see Stopping, not Killing.
H2. The SIGKILL escalation can never fire
Where: composeCleanup.ts.
Problem: child.killed becomes true as soon as kill() successfully sends a signal, not when the child exits. So if (!child.killed) in the 10-second timer is always false. The same flag also makes the first guard !activeChildProcess.killed false on the second Ctrl+C. A second Ctrl+C is therefore not forwarded. It falls through to the "no child" branch and runs a teardown while Compose is still stopping, then exits. That works by accident.
Fix:
const alive = (c: ChildProcess) => c.exitCode === null && c.signalCode === null;
if (alive(child)) { child.kill(signal); /* escalate with alive(child) */ }
H3. Teardown can be interrupted by Ctrl+C, and it blocks the event loop
Where: teardownCompose.ts, composeCleanup.ts.
Problem: isTearingDown only protects Node. docker compose down is a child in the terminal's foreground group, so the terminal sends it SIGINT directly. A Ctrl+C during teardown kills down mid-way, which leaks networks again. Because teardown uses spawnSync, the handlers cannot run while it executes, so the guard is moot. There is also no timeout, so a hung down blocks forever.
Fix: Make teardown async and run it detached, so the terminal cannot reach it. Absorb signals while it runs and add a timeout:
export async function teardownCompose(...): Promise<void> {
  setTearingDown(true);
  try {
    const child = spawn("docker", args, { detached: true, stdio: [...] });
    await onceClosedOrTimeout(child, 60_000);   // retry once, then warn
  } finally { setTearingDown(false); }
}
H4. Dev and prod teardown leak anonymous volumes
Where: runDev, runProd, runMeshDev, runMeshProd, docker-compose.dev.yml.
Problem: Teardown correctly omits -v to protect named volumes. But down without -v also keeps anonymous volumes, and the dev template mounts anonymous /app/node_modules. Every dev run creates a new anonymous volume that nothing removes. The disk fills silently with dangling volumes.
Fix: Remove only the anonymous volumes first, then bring everything down:
docker compose -p <name> rm -sfv        # stop, force, delete anonymous volumes only
docker compose -p <name> down --remove-orphans
Alternatively use a named volume for node_modules and accept it going stale after dependency changes.
Verify: Compare docker volume ls -qf dangling=true | wc -l before and after three dev runs.
H5. -v on down collides with the root -v, --version (verify)
Where: service/commands/down/command.ts, mesh/commands/down/command.ts, cli.ts.
Problem: Commander recognizes program options both before and after a subcommand unless enablePositionalOptions() is set. builder mesh down -v is likely consumed by the root and prints the version, and nothing is torn down. The documented example builder service down -v hits the same issue.
Fix: Drop the short flag and use --volumes only, or move the version flag to -V.
H6. down is fragile and tears down the wrong set of projects
Where: both down handlers.
Problems:
1. They first run compileEnvironment, which needs docker compose config to succeed. down is most needed when the config is broken (missing env, a deleted file), and then it fails too.
2. service down test maps to the -test project only. service up test also creates -e2e, which stays behind.
3. mesh down test tears down the mesh -e2e project. The per-service -test and -e2e projects created by mesh up test are never touched. mesh down rejects test-unit while service down accepts it.
Fix: Tear down by project name, with no compile step:
docker compose -p <project> down --remove-orphans [-v]
Add a helper projectNamesForStage(stage) that returns every project a stage can create. For a mesh test, that is each service's -test and -e2e plus the mesh -e2e. Compose finds resources by project label, so no YAML is needed. (verify -v removes volumes without a file on your Compose version.)
H7. Dev and prod share one project name
Where: projectName.ts, compileMeshEnvironment.ts.
Problem: deriveProjectName only suffixes test and e2e. up prod recreates the running dev containers. Worse, down dev compiles the dev YAML with the same project name, and --remove-orphans then removes the prod-only services such as mocks.
Fix: Keep dev on the base name so existing dev volumes survive, and give prod its own suffix:
const SUFFIX = { dev: "", prod: "-prod", test: "-test", e2e: "-e2e" };
Update the two tests that expect the prod name to equal the base name.
H8. Mock top-level resources are merged without namespacing
Where: mergeTopLevelResources in compileMeshEnvironment.ts.
Problems:
- Two services that use the same mock file share one named volume, so isolated mocks leak data into each other.
- A mock's networks: can overwrite mesh or *_net, even though every service's networks is overwritten anyway.
- secrets.*.file and configs.*.file keep paths relative to the mock's directory. Compose resolves them against the mesh directory, so they break.
Fix: Namespace volumes per owner and rewrite the references. Never merge networks. Rebase file: paths:
for (const [key, def] of Object.entries(parsed.volumes ?? {})) {
  const ns = `${owner}_${key}`;
  composeConfig.volumes[ns] = def;
  for (const svc of ownerServices) rewriteVolumeSource(svc, key, ns); // string + {source}
}
🟠 MEDIUM
M1. E2E env precedence is backwards. compileEnvironment.ts passes .env, then .env.e2e, then .env.prod. Later files win, so prod overrides e2e. Reorder to .env, .env.prod, .env.e2e.
M2. The minimum Compose version is not enforced. The templates use env_file: {path, required: false}, which needs Compose ≥ 2.24. checkDependencies only checks that docker compose version exits 0. Older versions fail with an obscure schema error such as "env_file.0 must be a string". Parse docker compose version --short, enforce the minimum, and teach explainComposeMergeFailure to recognize that error. It should also recognize required variable X is missing a value and port-in-use errors.
M3. mesh up and mesh down never call checkDependencies. Only the service hook and the two check handlers do. Add a preAction hook to the mesh command, or call it in the handlers.
M4. The stage check in the hook is case-sensitive. builder service up DEV skips checkDependencies-adjacent preflight (checkInfra), but the handler lowercases and runs dev anyway. Lowercase stageArg in the hook, or use Argument.choices(SERVICE_STAGES) and remove the duplicate lists.
M5. The default mesh healthcheck assumes Node. Your own build log shows the gateway image running apk add nodejs, which only exists to satisfy the probe. In single-service mode, service_healthy is added for the app and mocks without checking they define a healthcheck, which makes Compose fail with "no healthcheck configured". Fixes:
- Default to a CMD-SHELL TCP probe that works without Node.
- Allow healthcheck: { "type": "tcp" } in mesh.json.
- In addDependenciesToAppService and makeE2eDependOnApp, fall back to service_started or fail with a clear message when the target has no healthcheck.
M6. provideDependency and replaceMocks keys are not validated against the consumer's build.json. A typo is silently ignored, so you get no dependency and no alias. Alias collisions are possible: two consumers mapping the same depKey to different providers get round-robin DNS, and an alias can equal another service's name. Validate these during compile and throw.
M7. Silent fallbacks remain in the mock resolver.
- A missing dep.serviceName quietly uses the first service.
- A root-dependency companion service is skipped if its key already exists, so the second dependency reuses the first one's database.
- The tester copies only its first service, so sidecars such as a browser container are dropped.
- Renamed sidecars keep stale depends_on, links and volumes_from references. This is latent today because your mocks have no sidecars, but renameServicesWithDependencies already contains the logic to reuse.
M8. Override files are only partially honored.
- Volumes are applied only in dev, and only string-form entries.
- Bare env names (FOO) become "", but Compose pass-through is null.
- command, ports and build args are dropped with no warning.
Warn on every ignored key, or deep-merge the override service.
M9. meshSchema is too loose.
- It isn't .strict(), so a typo like provideDependancy passes.
- healthcheck is z.any().
- Service names are not validated, yet they become network names and aliases (^[a-z0-9][a-z0-9_.-]*$ would work).
- Host ports are not checked for uniqueness. Two services with the same port collide on the host.
- Error messages with an empty path print as : message.
M10. Network count and pool exhaustion. A mesh creates one network per service plus mesh, and each takes a /16 from Docker's default pool. Cleanup helps, but a big mesh can still exhaust the pool alone. Add a preflight in checkDependencies that warns when docker network ls -q returns more than about 25 entries and prints the daemon-config fix. Also add a builder prune command that removes leaked Compose projects.
M11. Project-name collisions.
- normalizeProjectName falls back to "project", so unrelated projects can collide.
- Two checkouts of the same repo (clones, worktrees, parallel CI jobs) share one name.
Append a short hash of the absolute directory, at least for test stages. No lock prevents two concurrent builder runs on the same stage.
M12. Your own docker/Dockerfile.
- The prod stage copies only dist, but tsup externalizes dependencies, so node dist/bin.js --version likely fails with ERR_MODULE_NOT_FOUND. Install prod dependencies in that stage or bundle with noExternal.
- COPY . . runs as root before USER node, so writes by the watcher or tests can hit EACCES. Use COPY --chown=node:node.
- Corepack caches pnpm under root's home, so node re-downloads it at runtime. Set COREPACK_HOME and prepare pnpm during the build.
M13. Package metadata. (verify)
- main, types and exports point at dist/bin.js, so importing the package runs the CLI, and bin.d.ts has no exports. Remove them, or add a real index.ts.
- With rootDir: "./" in the base tsconfig, declarations may land in dist/src/. Check tsconfig.build.json.
- Templates ship twice (root and dist/templates).
- @types/node ^26 and commander ^15 against engines.node >=20 need a check against each package's own engines.
- tsc-alias is unused and the paths alias is unused. Remove both or use the alias.
M14. vitest.config.ts has a custom esbuild plugin. It re-transforms every TS file containing an @ character, with target node18, and resolves esbuild through tsx. It is unnecessary, and it breaks if esbuild isn't resolvable. Remove it.
M15. Tests.
- handleServiceDown("dev") and handleMeshDown("dev") really run docker compose down against the example projects. They would tear down a developer's running example-backend stack.
- The runner tests mock runCompose but still call the real compileEnvironment, which needs Docker.
- The signal tests call the real process.emit("SIGINT"), and the handlers stay registered for the whole worker. A stray signal then runs process.exit. Export a reset function that removes the listeners.
- getMeshJson("/tmp") flakes if /tmp/mesh.json exists. Use mkdtemp.
- prepublishOnly still depends on Docker, hadolint and conftest pulls.
Inject a ProcessRunner interface (spawn, spawnSync) so unit tests run without Docker. Gate real-Docker tests behind RUN_DOCKER_TESTS=1. Add tests for exit-code and signal mapping, the double-delivery fix, projectNamesForStage, volume namespacing and alias validation.
M16. redactSecrets regex. \s* after the colon matches newlines, so secrets:\n  db_pw: gets the next line replaced. Use [ \t]*. It over-matches AUTHOR and KEYBOARD, and it misses PASSWD, CREDENTIAL, and passwords inside URLs.
M17. CLI error handling.
- Commander usage errors are printed by Commander, then printed again as ❌ Error: and exit 1 instead of the error's own code.
- builder with no arguments exits 0 after printing help.
- Messages that start with ❌ get a second prefix from runCli.
- checkYamlFiles prints each error and then throws them joined, so they appear twice.
M18. activeComposeSet teardown is effectively dead code. Entries exist only while a child is running, and the child branch returns first. Simplify: the runners' finally blocks already do the real work.
M19. Path containment is inconsistent.
- checkMeshServices rejects service paths outside the mesh directory, but compileMeshEnvironment accepts them, so a monorepo layout like ../backend passes compile and fails check.
- The containment check is lexical. startsWith("..") rejects a directory named ..foo, and symlinks are not resolved (use realpath).
- dependencies[].path and overrides[].path get no check before being passed as -f.
Decide the policy, apply it in both places, and document that running builder in an untrusted repo means running its Dockerfiles.
M20. Hardening for the tool containers.
- The conftest mount is read-write. Use --mount type=bind,src=...,dst=/project,readonly, which also removes the colon-splitting problem with Windows paths.
- Add --network none for hadolint and conftest.
- Consider pinning to image digests. A :z option may be needed on SELinux systems.
M21. Image and disk growth. Every stage builds images that nothing removes. Use down --rmi local for test stages, or document docker image prune.
M22. Preflight cost. checkDependencies runs docker info on every command. The --dry-run flag still launches hadolint and conftest containers.
🟡 LOW
- L1. toComposePath leaves .hidden without ./ (works, but inconsistent). On Windows, a cross-drive result becomes ./D:/....
- L2. runCompose treats a null code with no signal as 0. It should be 1.
- L3. Stale pre-up cleanup prints compose down noise on every test run. Pipe its output.
- L4. getTemplatesDir doesn't check that BUILDER_TEMPLATES_DIR contains docker/, and the cache survives a changed environment.
- L5. Atomics.wait as a sleep blocks the thread. It goes away once teardown is async.
- L6. Duplicated definitions remain: SERVICE_STAGES and MESH_STAGES, MeshUpOptions (unused), MeshStage (unused), and runDev/runProd with their mesh twins. Collapse them into one runUp(stage, opts).
- L7. extractBuildDeps uses import z from "zod" and prints raw ZodError.message. extractOverrides has an unused Environment import. z.record(z.enum(...)) and required_error are zod 3 behaviors that change in zod 4, so pin the major version.
- L8. BuildJson and MeshConfig still carry [key: string]: any. healthcheck?: any in MeshServiceConfig.
- L9. Dockerfile base images are not digest-pinned. The license is UNLICENSED while publishConfig.access is public. There are no lint or format scripts. Adding @typescript-eslint/no-floating-promises is worth it now that runners are async.
- L10. unitFixes.test.ts has unused imports (os, resolveProjectDir, checkYamlFiles). Its redaction fixture mixes = into a YAML mapping.
Suggested order
1. H1 to H3 together, as one process-runner module: async detached spawn, single-forward signals, alive() escalation, async detached teardown with timeout.
2. H6 and H7: project-name teardown, projectNamesForStage, and the prod suffix.
3. H4 and H5: anonymous-volume cleanup and the --volumes flag.
4. M1 to M4: env order, Compose version check, mesh preflight, stage casing. All small.
5. H8, M5 to M9: mesh compiler correctness, with a fixture where two services share a mock with a named volume and where ports and dependency keys differ.
6. M12 to M15: Dockerfile, package metadata, hermetic tests.
7. Everything else.
I can write the process-runner module (H1 to H3) and the projectNamesForStage teardown (H6) first, since both are self-contained and the double-SIGINT fix changes how your shutdown behaves.



The audit is highly accurate. The issues identified in the lifecycle, Docker Compose orchestration, and CLI routing are real problems that will cause container zombies, silent disk exhaustion, and cross-project contamination.

However, several of the auditor's proposed fixes introduce unintentional side effects—especially in an environment where developers are running multiple projects or meshes simultaneously.

Here is a breakdown of the actual issues, the side effects of the proposed fixes, and how to safely resolve them for a concurrent, multi-project environment.

1. Process Lifecycle & Signals (H1, H2, H3)
The Issue: The audit correctly identifies that a single Ctrl+C sends a SIGINT to the whole terminal process group. Because your Node script catches it and manually forwards it via child.kill(signal), Docker Compose receives it twice and executes a hard SIGKILL, bypassing graceful shutdowns. Furthermore, spawnSync in the teardown blocks the event loop, making it vulnerable to interruption.

Proposed Fix Side Effects:
The auditor suggests spawning Docker Compose with detached: true (putting it in its own process group) and making teardown asynchronous and detached.

- The Zombie Problem: If you detach the child process and the Node process crashes hard (e.g., OOM, kill -9, or an unhandled exception), the child process becomes orphaned. Docker Compose will continue running in the background indefinitely.
- 
- The Race Condition: If teardown is detached and Node exits immediately, the terminal prompt returns to the user while containers are still stopping. If the user immediately types builder up, Compose will fail with port conflicts or network locked errors.
- 
The Resolution:

1. Do not detach the main up process. Keep it in the same process group so the OS guarantees it receives terminal signals. Instead, use a boolean flag (isShuttingDown) in your Node handler to track if SIGINT has been received. Let the OS deliver the first SIGINT to Compose naturally, and only manually escalate to SIGKILL (using the auditor's correct alive(child) check from H2) if the timeout expires.
2. 
3. Make teardown async, but await it. Use spawn instead of spawnSync for teardown, but await its completion before letting Node process.exit(). During this await, explicitly ignore further SIGINT events in Node so the user cannot accidentally abort the teardown by mashing Ctrl+C.
4. 
2. Anonymous Volumes & Disk Leaks (H4)
The Issue: Your dev template mounts /app/node_modules anonymously. Because docker compose down ignores anonymous volumes, every builder dev run abandons a volume, silently filling the user's disk over time.

Proposed Fix Side Effects:
The auditor suggests running docker compose rm -sfv before down, or using named volumes.

- The Stale Cache Problem: If you switch to named volumes (e.g., app_node_modules:/app/node_modules), the volume persists across runs. If a user changes branches or updates package.json, Docker will use the stale node_modules from the volume instead of the freshly built image, breaking the app.
- 
The Resolution:
Use named volumes for node_modules to prevent disk leaks, but introduce a checksum-based naming convention or force an update. The simplest robust fix is to run an anonymous-volume cleanup command targeting only the app container before teardown:
docker compose -p <project> rm -f -v app
This specifically wipes the anonymous node_modules mount without accidentally deleting persistent databases.

3. Project Naming & Concurrency (H6, H7, M11)
The Issue: Dev and Prod share the same base project name. If you run up dev and then up prod, Compose will destroy and recreate the containers. Furthermore, running the same project from two different terminal tabs (or CI jobs) will cause catastrophic collisions.

Proposed Fix Side Effects:
The auditor suggests appending -prod to the project name and relying on project names for teardown instead of YAML files.

- Host Port Collisions: If dev is named my-app and prod is named my-app-prod, they are separate Compose stacks. If a user runs both, Compose will attempt to bind both to the same host port (e.g., 3000), causing the second one to crash.
- 
- Orphaned Resources on Rename: If you tear down by project name without YAML, and the user renames the project in build.json, builder down will look for the new name, leaving the old project running forever.
- 
The Resolution:

1. Namespace by Directory Hash: Update deriveProjectName to append a short hash of the absolute directory path (e.g., my-app-a1b2c3d). This guarantees that two clones of the same repo on a single device never collide.
2. 
3. Strict Port Management: If you suffix environments (-dev, -prod), you must programmatically randomize or offset the host ports for non-primary environments, or explicitly warn the user if a port collision is detected via a pre-flight check.
4. 
5. Stateful Teardown Tracking: Do not rely purely on the current build.json for teardown. Have up write a .builder/run.state file containing the exact Compose project name and stage used. Have down read this state file to tear down the correct resources, even if build.json was modified in the interim.
6. 
4. Mock Resource Merging & Leakage (H8)
The Issue: When multiple services rely on the same mock dependency, their Compose resources (volumes, networks) merge without prefixing.

Proposed Fix Side Effects:
The auditor suggests aggressively namespacing volumes per owner (e.g., serviceA_db_data and serviceB_db_data).

- Broken Singleton Mocks: In a mesh environment, developers often want services to share a mock (e.g., a single shared Redis or Auth database). If you namespace by the consuming service, you isolate them. Service A writes to its database, but Service B reads from a completely empty, separate database.
- 
The Resolution:
Namespace top-level resources based on the dependency provider's key, not the consumer's key. If both auth-api and billing-api depend on shared-db, the volume should be named mesh_shared-db_data. This ensures the mock is isolated from other meshes on the host, but correctly shared among all services within the current mesh.

5. Commander CLI Option Collisions (H5)
The Issue: builder service down -v conflicts with Commander's global -v (version) flag.
The Resolution: The auditor is completely correct here. Change the global version flag in cli.ts to -V, --version (capital V is standard Commander practice for version) to free up -v for --volumes in the down commands.


### 1. Process Lifecycle & Signal Handling (H1, H2, H3)

**Objective:** Ensure graceful shutdown of Compose containers without orphaned processes or interrupted teardowns.

* **Keep Main Process Attached:** Do not use `detached: true` for the primary `spawn` call. Let the OS deliver the initial `SIGINT` directly to Docker Compose.
* **Track Shutdown State:** Introduce an `isShuttingDown` boolean in `composeCleanup.ts`. On the first `SIGINT`, set this flag and allow Compose to attempt a graceful shutdown.
* **Manual Escalation:** Implement a 10-second timeout. After 10 seconds, check if the child is still active using `const alive = (c) => c.exitCode === null && c.signalCode === null;`. Only escalate to `child.kill("SIGKILL")` if `alive(child)` is true.
* **Async Teardown:** Convert `teardownCompose` from `spawnSync` to an asynchronous `spawn`. `await` its completion before allowing Node to exit.
* **Signal Shielding:** During the `await` phase of teardown, explicitly trap and ignore further `SIGINT` events in Node to prevent the user from aborting the cleanup mid-flight.

### 2. Anonymous Volumes & Disk Leaks (H4)

**Objective:** Prevent disk exhaustion while avoiding stale `node_modules` caches across branch switches.

* **Retain Anonymous Volumes:** Keep the `/app/node_modules` mount anonymous in the dev template so Docker always uses the freshly built image layer when dependencies change.
* **Targeted Pre-Teardown Cleanup:** Inject a specific cleanup command immediately before `docker compose down`. Run `docker compose -p <project> rm -f -v app`. This explicitly wipes the anonymous `node_modules` volume attached to the app container without risking persistent named volumes (like databases).

### 3. Project Naming, Concurrency & State Tracking (H6, H7, M11)

**Objective:** Prevent container and port collisions when running multiple stages or duplicate clones simultaneously.

* **Directory Hashing:** Modify `deriveProjectName` to append a short cryptographic hash (e.g., first 7 chars of SHA-1) of the absolute directory path to the base project name.
* **Stage Suffixing:** Append the stage to the hashed name (e.g., `my-app-a1b2c3d-dev`, `my-app-a1b2c3d-prod`).
* **Stateful Teardown:** Stop relying on the current `build.json` state for `down`. In the `up` command, write the derived Compose project name and stage to a local `.builder/run.state` file. Read this file in the `down` command to ensure the exact running resources are targeted, even if `build.json` was renamed.
* **Port Collision Pre-flight:** Add a check in `checkInfra` or the `up` handler to verify if the requested host ports are already bound, explicitly warning the user if running `-dev` and `-prod` simultaneously causes a conflict.

### 4. Mock Resource Namespacing (H8)

**Objective:** Prevent cross-mesh data leakage while allowing services within the *same* mesh to share singleton mocks.

* **Namespace by Provider:** In `compileMeshEnvironment.ts`, namespace top-level volumes, secrets, and configs using the **dependency provider's key**, rather than the consumer's key.
* **Format:** If a shared dependency is keyed as `shared-db`, the generated volume must be named `mesh_shared-db_data`.
* **Path Rebasing:** When rewriting `secrets.*.file` and `configs.*.file`, resolve their paths against the mesh root directory to prevent broken references when executing from different service subdirectories.

### 5. CLI Flags & Tooling Refinements (H5, M1-M14)

**Objective:** Resolve flag conflicts and tighten infrastructure dependencies.

* **Version Flag:** In `cli.ts`, change `.version(version, "-v, --version")` to `.version(version, "-V, --version")` (capital V). This frees up `-v` for the `--volumes` flag in `down` commands.
* **Env Precedence:** Update `compileEnvironment.ts` to load environment files in the strict order: `.env` → `.env.prod` → `.env.e2e`.
* **Compose Minimum Version:** Parse `docker compose version --short` during `checkDependencies` and enforce `^2.24.0` to safely support `env_file: { required: false }`.
* **Dockerfile Permissions:** Update the internal `docker/Dockerfile` to use `COPY --chown=node:node . .` to prevent `EACCES` errors during test runs or file watching.
* **Preflight Hooks:** Add `checkDependencies` to the `preAction` hook of the `mesh` command, ensuring daemon validation runs for all global mesh operations.