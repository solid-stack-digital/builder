# 02 — Compose materialization, environment, endpoints and tester compilation

Prerequisite: [01_CONFIGURATION_AND_GRAPH.md](01_CONFIGURATION_AND_GRAPH.md). Implement one shared materializer for standalone and mesh. Preserve the protections in existing path/resource/cleanup regression tests while removing V2 assumptions.

## 1. File-level implementation map

| File | Required edit |
|---|---|
| `src/core/composition/compileServiceComposition.ts` | Thin standalone load/resolve/graph/materialize adapter; remove dependency sweep and generated tester build |
| `src/core/mesh/compileMeshComposition.ts` (new) | Thin mesh load/extends/graph/materialize adapter |
| `src/core/composition/compileGraphComposition.ts` (new) | Common deterministic compiler over EffectiveGraph |
| `src/core/composition/compileTester.ts` (new) | Shared build/mesh Compose-backed tester compilation |
| `src/core/composition/types.ts` | MaterializedModule, EnvironmentLayer, shared result types |
| `src/core/composition/validateServiceCompose.ts` (rename/rework validateDependencyCompose) | Representative-aware validation and ordinary ownership rules |
| `src/core/composition/namespaceServiceCompose.ts` (rename/rework namespaceDependencyCompose) | Atomic module namespacing independent of dependency classifications |
| `src/core/composition/resolveEnvironment.ts` (new) | Winning env entry selection, scope-aware interpolation and authoritative env |
| `src/core/composition/serviceEndpoints.ts` | Build registry from active modules and owner map, no app/dependency buckets |
| `src/core/composition/composeDependsOn.ts` | Preserve native conditions; add typed Builder conditions |
| `src/core/composition/requisiteLifecycle.ts` (replaces dependencyLifecycle) | Consumer-module gates and complete tester barrier |
| `src/core/composition/validateOverrideCompose.ts`, `mergeAppOverride.ts` | Main key, one selected override, protected fields; rename helpers to main vocabulary |
| `src/core/config/hostPorts.ts` | Pure allocation proposal plus explicit post-validation cache persistence |
| `src/core/mesh/v2/*` | Delete after all imports migrate; no provider bindings survive |

Keep filename `compileApplicationEnv.ts` and public API for compatibility of the utility name, but change its implementation to consume V3 main metadata. Other helper names may be renamed only as listed; update all imports in the same step.

## 2. Shared materialized module and environment types

```ts
interface MaterializedModule {
  nodeId: NodeId;
  sourceFile: string;
  document: ComposeDocument;
  serviceNameMap: Map<string, string>;
  representative: string; // final Compose service key
  serviceNames: string[];
  endpointOwnerMap: Map<string, string>;
}
interface EnvironmentLayer {
  kind: 'dotenv' | 'compose-default' | 'build' | 'override-compose' | 'mesh' | 'internal';
  values: Record<string, Located<string | null>>;
}
```

Main is a module with one container and itself as representative. Ordinary module may have many containers, but its primary endpoint service or explicit endpoint-less `service` is its sole lifecycle representative. The graph node lifecycle classification applies to that representative. Helpers are not implicitly additional logical nodes or health gates.

Compiled composition includes runtimeServiceNames (all active main/ordinary containers), testerServiceNames (all tester Compose containers), testerServiceName (selected runner) and mainServiceNames. Never make callers reconstruct these by assuming `app`, `main`, `tester`, or prefixes.

## 3. Compile in this exact order

1. Obtain final effective declarations, graph, closures, classes and publication intent from file 01.
2. Load Compose metadata only for reachable ordinary modules and E2E tester; select exactly one effective main override per source. Resolve selected paths with origin-aware path rules. Do not parse obsolete overridden files.
3. Validate module schema, internal service/resource references, representative/endpoint ownership and lifecycle-specific health. Load main Dockerfile metadata for target/health validation through the common checker from file 03.
4. Build winning env entry maps with precedence below. Validate authoritative-key collisions and effective references; unused lower-precedence reference text is ignored.
5. Validate publication capability and fixed duplicate conflicts. Construct stable logical-to-runtime identity maps.
6. Allocate host ports in sorted canonical endpoint order, using placeholders in validation/dry-run. Keep proposed cache data in memory; do not write it yet.
7. Build main/module/tester Compose documents, rebase paths, namespace resources, attach shared network, assign endpoint owners/ports, interpolate winning Builder env, inject only applicable internal env.
8. Emit explicit requisite lifecycle conditions and tester barrier. Preserve internal Compose conditions.
9. Validate final resource/service references, uniqueness, all actual Compose ordering edges, protected ownership and unique published host mappings. Serialize with existing dollar escaping/redaction discipline.
10. Return compiled result. Real runner preparation persists the allocation proposal only after final validation and startup port checks. Public compile APIs may produce real AUTO values but must not leave caches on compilation failure. Validation/dry-run never persists.

No runtime resources, including application builds, start before steps 1–9 succeed. Compose metadata loading and pure logical graph indexing may be interleaved where dependencies require it; effective merge/reference selection must still precede reference rejection and allocation.

## 4. Main runtime and override composition

Update all five `templates/docker/docker-compose.*.yml` files to use `services.main` as their canonical seed key. Base contains build context, init and logging defaults only. Stage templates choose dev/test/prod (E2E prod) and correct optional dotenv. E2E template has no tester. Remove implicit `.:/app` and `/app/node_modules` dev mounts; examples supply these through main override.

Main build context is the source project; Dockerfile is its canonical Dockerfile; selected target comes exclusively from execution profile. Main env_file is exactly optional `.env.<envStage>` from that source directory. E2E uses `.env.e2e`, never `.env.prod` plus `.env.e2e`.

Main override document must define exactly `services.main`, plus optional consumed volumes/networks/configs/secrets and x- extensions. Reject extra runtime services. Namespace all resource definitions and references with the main module identity. Preserve mounts, command/entrypoint customizations, build.args, labels, logging and safe technology-specific settings.

Retain protective validation for ports, depends_on, network_mode, container_name, profiles, extends, env_file, privileged and replacement build target/Dockerfile/context. A repeated context resolving to the canonical source context is permitted. `build.args` is permitted and follows the selected override's own map; do not merge args from discarded override files. Keep healthcheck overrides limited to timing fields, preserving required Dockerfile health commands. Reject EXEC_MODE/INFRA_MODE and PORT when main has a primary endpoint. With no endpoint, PORT is not Builder-generated and a user value is permitted.

The override path itself can come from source or mesh extends. Source-origin override contents resolve relative to source project; mesh-origin override contents resolve relative to mesh project. Rebase to final output directory and verify build.context against source project. The selected override's env is placed below mesh extends env, even when mesh selected its path. Preserve this pinned precedence; do not apply it by incidental loop order.

Tests: chosen override file only, including nonexistence/invalid contents of a superseded file; base override valid; e2e scalar replacement of prod override; mesh override path provenance; allowed build args/resources; forbidden target/context/ports/internal env; technology-agnostic dev template.

## 5. Ordinary module validation and atomic materialization

For every reachable ordinary node:

1. Require nonempty Compose services and validate every referenced service, volume, config, secret and network. Preserve internal `depends_on`, links, volumes_from, network_mode service references, ipc/pid service references and build resource references through namespace mapping.
2. If endpoints nonempty, require one primary; every endpoint owner must exist. Representative is primary.service. If top-level service is present, it must equal that representative. Other endpoint owners are not automatically lifecycle representatives.
3. If endpoints empty, require top-level service and require it exists. Do not return early or treat this module as inert. Jobs without ports are the primary prerequisite use case.
4. Determine health requirement from effective lifecycle: dependency targets require representative health; E2E long-running nodes all require representative health; prerequisite representatives do not need health and must use completion. Requirement-only ordinary modules outside E2E do not need health merely because they expose an endpoint.
5. Support Compose-declared health checks and Dockerfile/image-inherited health. For build-backed modules, inspect the selected target's effective Dockerfile metadata; for image-backed modules lacking explicit health, the infrastructure preflight inspects image metadata before container creation. In pure validation without available image metadata, report a deferred image-health check in compiled metadata; real runners must resolve it before startup, never silently consider it valid. An explicit disabled/NONE check overrides inherited health and fails when health is required.
6. Reject raw host ports, host network mode, fixed container_name, privileged true and host-root bind mounts. Endpoint owners cannot use network_mode that prevents Builder DNS/network attachment. Retain internal resource/path safety checks. For `include`, `extends` and profiles retain existing explicit unsupported-feature errors until normalized input is supported; do not let hidden services bypass atomic validation.
7. Clone and namespace the entire module once, including helper containers with no endpoint. Remove source Compose project name and let Builder own project identity. Every helper appears in materialization and cleanup membership.
8. Apply ordinary Builder env to every container after its own Compose defaults. Do not give any container main's dotenv or execution variables.
9. Prerequisite representative must not restart indefinitely: reject restart policies other than absent or `no` for that representative. Runtime nonzero status must remain observable as failure, not be hidden by retries.

Retain `.dockerignore`, Dockerfile/context bounds, env_file, config/secret file and volume validation from existing `validateMaterializedComposeFiles.ts` / `validateMaterializedComposeBuildInputs.ts`. Rebase only paths defined as filesystem paths; do not rewrite remote build contexts or image names.

## 6. Names and network layout

Use existing `GeneratedComposeNameAllocator` with JSON tuple identity inputs and collision assertions. Canonical readable candidates:

- Standalone main: `main`.
- Standalone ordinary container: `svc--<logical>--<compose-service>`.
- Mesh main: `<mesh-root>`.
- Mesh ordinary container: `svc--<mesh-root>--<logical>--<compose-service>`.
- Tester container: `tester--<compose-service>` (allocator resolves conflicts).
- Module resources: `<module-readable-prefix>--<resource-kind>--<original-name>`.

Candidate collisions use the existing allocator's deterministic disambiguation; never concatenate without identity checks. Sort identities before allocating names so declaration key order does not change output. Source aliases get different identities even when directory/name/internal Compose service are identical.

Use one Builder-owned bridge network key `builder` shared by active mains and ordinary module containers compatible with network attachment. Preserve namespaced module-private networks. Containers using `network_mode: service:<local>` share the target's network namespace and must not also receive networks. Endpoint owners and lifecycle representatives must be reachable via their final DNS service names. Explicit bridged tester containers join builder; host testers do not.

Private publication means no host binding, not automatic network isolation. Do not invent network isolation semantics beyond V3. Internal source aliases/resource references must not accidentally grant cross-module identities or collide with global service DNS names.

Do not rewrite literal service hostnames inside arbitrary application strings. Builder env authors use endpoint references; module-local Compose aliases and internal references are preserved under module namespace rules. Retain regression coverage for long names, delimiter ambiguity, external resource declarations, secrets/configs, anonymous volumes and duplicate local service names.

## 7. Environment precedence and winning-value selection

Implement these exact lists, lowest to highest:

| Recipient/profile | Precedence |
|---|---|
| Standalone main dev/prod/test | source `.env.<stage>` → base main env → stage main env → selected override env → internal main env |
| Standalone main E2E | source `.env.e2e` → base main env → prod main env → e2e main env → selected override env → internal main env |
| Mesh main dev/prod | source dotenv → source base env → source stage env → selected override env → mesh base extends env → mesh stage extends env → internal |
| Mesh main E2E | source `.env.e2e` → source base/prod/e2e env → selected override env → mesh base/prod/e2e extends env → internal |
| Ordinary dev/prod | per-container Compose defaults/env_file → source base/stage service env → mesh base/stage extends service env |
| Ordinary E2E | per-container Compose defaults/env_file → source base/prod/e2e service env → mesh base/prod/e2e extends service env |
| Standalone tester runner | Compose implementation defaults → source `.env.e2e-tester` → base/prod/e2e tester env → internal tester env (currently empty) |
| Mesh tester runner | Compose implementation defaults → root `.env.e2e-tester` → mesh base/prod/e2e tester env → internal tester env (currently empty) |

Ordinary internal env is currently empty. Do not invent variables merely because the spec reserves that layer. Tester internal env is empty; specifically never EXEC_MODE or INFRA_MODE.

Build winning maps per key by scanning high to low; interpolate only the selected Builder JSON value with its origin. Native Compose env null/pass-through remains meaningful; do not convert null into the string `null`. Native Compose environment/defaults use native interpolation rather than Builder endpoint parsing. Builder JSON values must all be strings even if a native Compose layer uses lists/null.

Dotenv handling must preserve the existing Compose-compatible literal-dollar/multiline behavior. When composing tester defaults, ensure explicit Compose environment does not accidentally beat `.env.e2e-tester` merely because Compose normally gives `environment` precedence over env_file: resolve/merge runner defaults and tester dotenv in the mandated order before serializing the final runner environment. Apply the same explicit source selection discipline in environment export. Keep raw dotenv parsing/interpolation at the native Compose boundary; use a shared resolver rather than a naive line splitter.

Validate authoritative key attempts at their originating layer, including dotenv and override. Main EXEC_MODE/INFRA_MODE are always protected; PORT is protected only with a primary endpoint. Ordinary/tester explicitly configured EXEC_MODE/INFRA_MODE fail; they never inherit main dotenv. Explicit reserved keys in their Compose env_file also fail. Do not infer Builder control over arbitrary environment baked into unknown third-party images; surface that as metadata validation when available, and ensure Builder itself injects none.

Tests `tests/v3/environment.test.ts` must assign a distinct marker at every layer, then remove each higher layer in turn to prove every precedence boundary. Include a shadowed invalid reference at each lower JSON layer. Verify module-wide env, helper-specific Compose defaults, runner-only tester env, dotenv separation, no `.env.prod` read for E2E, authoritative collisions, PORT selection/no-endpoint behavior and literal roundtrip through actual `docker compose config`.

## 8. Endpoint registry and host ports

Each active endpoint registry entry derives network_host from its actual namespaced owner, network_port from effective endpoint.port and scheme from effective endpoint. Main PORT comes from the unique primary endpoint, independent of host port. Public host/port exist only for selected publication intents. Generate network/public address and URL via existing property helper after adapting diagnostics.

Allocate all selected endpoints globally once per composition. Sort by canonical tuple `[meshRootOrNull, sourceService, endpoint]`; reserve all fixed requests before AUTO. Use `.builder/ports-v3.json` with version 3 and canonical keys. Do not import V2 cache keys. Preserve available prior allocations where safe; allocated ports are not a permanent reservation. Recheck actual fixed/AUTO availability before startup, and abort with both logical owners for collisions.

Generated ports use TCP and host_ip 127.0.0.1 as today. Add publication only to the endpoint's owner container. Multiple endpoints on different internal services are supported. No raw source publication leaks into mesh. Pure validation/dry-run uses deterministic nonconflicting placeholders without host probes/cache writes. Real execution uses actual available ports. Failed compilation must leave no partial cache or run state.

Tests: endpoint owner identity; primary PORT distinct from publicPort; cross-source names; fixed/AUTO conflicts; deterministic placeholders; cache commit only on valid runtime preparation; port reuse/reallocation; no allocations for unreachable/private endpoints.

## 9. Requisite-to-Compose lowering

Remove `enforceHealthyDependsOn`. `normalizeComposeDependsOn` converts native short syntax to `{condition:'service_started'}` and preserves valid explicit long-form condition/restart/required fields. It must not turn native completion into health.

For each active Builder edge:

- requirement: emit nothing.
- dependency: for each Compose container in consumer module, add target representative with `condition: service_healthy`.
- prerequisite: same, with `condition: service_completed_successfully`.

Builder-generated edges are required and cannot be weakened by native Compose fields. Native internal edges target only containers in their module; reject unknown external service references at module validation. Merge duplicate equivalent conditions once. Check the final concrete Compose ordering graph for cycles, including internal helper dependencies that were invisible in the logical node graph. Report module paths on failure.

For E2E, add barrier dependencies to the selected tester runner for every active logical node representative. Use healthy for long-running nodes, completed-successfully for prerequisites; every main gets healthy. Do not add gates for dormant nodes or source-local testers. Preserve tester's own internal helper dependencies and detect concrete cycles after combining them. Successful helper exit must not end the suite or replace runner status.

Tests `tests/v3/composeLifecycle.test.ts`: requirement edges absent; dependency and prerequisite conditions exact; no forced main-to-all-dependencies behavior; every consumer container gated; primary representative only; internal started/completed preserved; mixed internal/generated cycle rejected; tester barrier includes requirement-only service and endpoint-less job; no health gate for prerequisite; no dormant gate.

## 10. Shared tester compiler

Port useful validation/namespacing from `src/core/mesh/v2/compileMeshTester.ts` into `compileTester.ts` and use it for both standalone and mesh.

1. Load final tester compose path and require selected service exists. Treat the complete tester Compose file atomically for namespacing and cleanup.
2. Preserve its selected image/build context/Dockerfile/target/command. Never force a target or create a test-e2e build. An arbitrary user-owned Dockerfile target is a Compose implementation detail, not a Builder lifecycle contract.
3. Namespace all containers/resources and rebase paths. Keep helper dependencies and selected runner identity.
4. Apply env precedence from section 7 only to the runner. Reject reserved execution variables. No main dotenv inheritance.
5. Honor explicit host mode or explicit bridge networks; default an otherwise unspecified runner to host for public endpoint testing. Public-property references still require effective publication. Network-property references are allowed by V3; connectivity limitations of a chosen tester network are documented, not converted into additional reference-grammar bans.
6. Add full graph barrier to runner and return the selected generated name plus all tester member names.
7. Tester has no Builder endpoints. Reject tester-owned host port mappings and fixed container identities; host networking is its specific ownership exception, not a privilege/root-mount exception.
8. Ensure tester only exists in E2E output. Unit/test profile contains main only. Source testers never appear during mesh dev/prod/global E2E.

Tests `tests/v3/testerCompilation.test.ts`: same implementation for standalone/mesh; stage env inheritance; unchanged custom build target; image-only tester; selected runner different from logical tester key; helper success/failure isolation; no EXEC/INFRA; host default and explicit bridge; public and network reference syntax; missing runner; no tester in non-E2E; complete graph barrier.

## 11. Integration gate

Run all file 01 tests plus composition/env/tester tests and `pnpm typecheck`. Update `compileEnvironment` to serialize the shared result and `compileMeshEnvironment` to import the non-versioned mesh compiler. Remove imports and files under `core/mesh/v2` after integration. Retain the existing public compile result fields (`yaml`, testerServiceName); expose additional runtime metadata internally to runners rather than reparsing YAML for identities.
