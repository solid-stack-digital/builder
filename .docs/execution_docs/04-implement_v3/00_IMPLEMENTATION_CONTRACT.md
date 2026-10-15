# V3 implementation contract and execution order

## Purpose and authority

Implement Builder 3.0.0 from the current 2.2.0 tree. This is a breaking replacement of the configuration model, not a V2 compatibility mode. This plan is based on a source inspection on 2026-10-16; no implementation or runtime test execution was performed while writing it.

Normative source: [spec_v3.0.0.md](../../specs_v3/spec_v3.0.0.md). The specification has two headings numbered 84; references below disambiguate “84 Naming” from “84 Build example.” [EXECUTION_MODEL.md](../../EXECUTION_MODEL.md) is older supporting material. Where they disagree, V3 wins. In particular, tester receives neither execution variable, there is no required `test-e2e` Dockerfile target, and source/requisite rewrites replace providers. Update that execution document in the final migration step; do not perpetuate its conflicting rules.

All work and temporary files must stay beneath this `builder` directory. Do not change sibling service/template repositories. Git use is read-only: no add, commit, checkout, restore, reset, merge, push, tag, or other mutation. Do not publish packages, sites, releases, or trigger a publishing workflow. The final deliverable is locally implemented and verified code plus documentation, not a release.

## Files and strict execution sequence

There are five plan files, including this contract. Read all five before editing implementation files. Execute in this order:

1. [01_CONFIGURATION_AND_GRAPH.md](01_CONFIGURATION_AND_GRAPH.md): public types, schemas, effective overlays, provenance, logical graph, reference permissions, publication intent.
2. [02_COMPOSE_AND_ENVIRONMENT.md](02_COMPOSE_AND_ENVIRONMENT.md): effective env, ports, Compose modules, namespacing, lifecycle edges, shared tester compilation.
3. [03_LIFECYCLES_AND_COMMANDS.md](03_LIFECYCLES_AND_COMMANDS.md): runners, barriers, cleanup, validation, CLI/export integration.
4. [04_MIGRATION_AND_VERIFICATION.md](04_MIGRATION_AND_VERIFICATION.md): fixtures, examples, docs, packaging, regression and Docker gates.

Each implementation step includes its own tests. Migrate a fixture or caller needed by an earlier step immediately, using file 04's rules. Do not defer all tests until the end. Temporary compiler failures during type replacement are expected; do not add public V2 aliases to hide them. Before advancing past file 02, all production callers must compile against V3.

## Observed baseline and required disposition

| Existing surface | Observed behavior | Required disposition |
|---|---|---|
| `package.json` | Version 2.2.0; `check:v2-no-legacy`; existing build/schema/test scripts | Final version 3.0.0; replace legacy gate; retain toolchain/dependencies unless code requires otherwise |
| `src/types/index.ts`, `src/core/buildSchema.ts` | `app`, `dependencies`, optional name/dockerfile, env-only tester | Replace with V3 reserved/ordinary services and strict schema |
| `src/core/mesh/types.ts`, `meshSchema.ts` | `path`, provider maps, root tester; reserved names include V2 structural words | Replace with source/extends/publish and nested tester |
| `src/core/config/resolveBuildStage.ts` | Dependency list processing and early graph validation | Replace with effective declaration resolution, no early env interpolation |
| `resolveMeshStage.ts`, `stageMerge.ts` | `dependsOn` and publish arrays union | Replace with recursive object merge and array replacement |
| `config/references.ts` | `app`/`dependencies` syntax; tester public-only rejection | Replace parser/scopes/closure checks; public use is recommended, not a syntax ban on network refs |
| `composition/compileServiceComposition.ts` | Validates all dependencies, drops endpoint-less ones, starts all integrated dependencies, builds tester from app Dockerfile | Replace orchestration with common graph compiler and Compose tester |
| `composition/composeDependsOn.ts` | Rewrites every Compose condition to healthy | Remove forced normalization; preserve internal conditions and emit typed graph edges |
| `composition/dependencyLifecycle.ts` | Every endpoint owner gates app health | Replace with declared edges and a single representative per module |
| `src/core/mesh/v2/*` | Provider substitution plus per-service partial compilation | Replace with non-versioned graph composition; remove V2 files after callers migrate |
| `compileMeshTester.ts` | Forces target `test-e2e`, host networking, EXEC_MODE=e2e; waits on mains only | Extract common tester compiler; no target/variable injection; whole-graph barrier |
| `runTest.ts`, `runMeshTest.ts` | Existing two-phase control flow | Retain structure; update metadata, isolation and failure paths |
| `runMeshServiceTests.ts` | Sequential sorted root services using `path` | Use base source entries, exclude tester, no mesh overrides |
| `runTestE2e.ts` | Hardcoded tester Compose name | Use compiler-returned runner identity |
| `compileApplicationEnv.ts` | Reads Compose service `app` | Read returned main identity |
| Templates and Dockerfile policy | app/test-e2e seeds; policy also requires EXPOSE prohibition and artifact copy | Main seeds only; V3 Dockerfile contract, technology agnostic |
| Tests and public docs | Extensive V2 conformance and regression coverage | Port valid protections; replace superseded assertions, keep explicit V2 rejection fixtures |
| Example builds/meshes | Eight V2 builds, two V2 meshes; largeProject mesh has no name | Convert all; preserve examples' functional scenarios |

Reuse low-level utilities after testing their assumptions: path safety, Compose path rebasing, deterministic name allocator, endpoint property calculation, host port conflict detection, YAML literal escaping, secret redaction, subprocess execution, strict teardown and volume discovery. Reuse is not permission to preserve V2 lifecycle or reference semantics.

## Pinned implementation decisions

These decisions fill implementation details the spec leaves implicit. They are part of this plan, not new configuration options.

| ID | Decision |
|---|---|
| D01 | `name` is a required nonblank string. Service identifiers use the canonical regex. Build requires base `services.main` and `services.tester`; mesh requires base `services.tester` plus at least one source. All Builder projects are testable; there is no optional-test capability flag. This follows §§23/34; §83's testable qualification does not create another schema variant. |
| D02 | Build keys `main` and `tester` dispatch to special schemas; other keys dispatch to ordinary schema. Mesh `tester` dispatches to tester schema; `main` is forbidden as a mesh source name. Formerly reserved names such as `app`, `dev`, or `dependencies` may be ordinary identifiers when their location is otherwise valid. |
| D03 | Existing `compose` or `source` may be repeated with the identical string; a changed string fails. Stage-introduced services must supply a complete declaration. The effective `override-compose` path is a scalar: only the last selected file is read and applied, not every inherited override file. |
| D04 | `false` is valid only in overlay requisite maps. Delete the canonical edge if present; deletion of an existing declaration's absent edge is an idempotent no-op. An unknown service name still fails target validation. No `false`, null deletion, or omission semantics exist elsewhere. |
| D05 | All declarations receive structural validation; all final declarations receive required-field/endpoint-shape validation. Runtime Compose file loading, env interpolation, health and runtime-resource checks apply to active nodes only (and E2E tester). Dormant service references do not cause materialization or active-stage failures. Explicit all-stage checks exercise each applicable active graph. |
| D06 | In isolated profiles the active graph is main only. Surviving references to external nodes are invalid; no external endpoints or ports are fabricated. Authors put integrated-only references in applicable overlays, or replace their values in isolated dev/test. Do not infer conditional env behavior from application DI. |
| D07 | Preserve origin per effective env entry and path. Build-authored names remain source-local after import. Mesh-authored unprefixed requisite names mean mesh roots; `source.x` means the current imported build. Reference parser behavior follows the value's origin, not the file compiling it. |
| D08 | Every reachable module is one logical node; one representative owns lifecycle status. Requirements never emit Compose depends_on. Apply ordering edges to every Compose container of the consumer module against the target representative. E2E barrier covers each logical node's representative, plus each main; helper processes retain their internal Compose lifecycle. |
| D09 | Main is always long-running except isolated unit execution. A prerequisite classification targeting main is invalid: it contradicts main's runtime/health contract. Requirements to self are allowed; dependency/prerequisite self edges are ordering cycles. Tester cannot be a requisite target. |
| D10 | Tester network references are accepted when reachable. Explicit host networking is supported; if the selected runner omits both network_mode and networks, default it to host networking for the existing loopback public surface. An explicit bridged tester is preserved and joined to the Builder graph network. Do not reject network-property syntax just because the runner uses host mode, or public-property syntax because it uses bridge mode. Reference validity follows V3 reachability/publication; document that Compose DNS requires bridge networking and the default loopback public surface requires host networking. The user owns the chosen runner connectivity. |
| D11 | Builder env and root tester dotenv apply to the selected tester runner only. Tester Compose helper containers keep their own env. Ordinary Builder service env applies module-wide. No runtime node except main may receive EXEC_MODE/INFRA_MODE; reject these keys in their effective explicit env/env files rather than inject them. |
| D12 | Keep `127.0.0.1` as public_host and existing fixed/AUTO allocation behavior, with V3 canonical endpoint keys and a new `ports-v3.json` cache. Check/dry-run do not persist allocation or state. Real startup rechecks host collisions. |
| D13 | Keep standalone convenience commands `test-unit` and `test-e2e`; they select workflow phases, never Dockerfile targets or app modes. Mesh public commands are exactly dev/prod/test. Internal mesh E2E compilation remains callable by the test orchestrator. |
| D14 | Preserve current source/project path containment checks. Resolve Compose declarations relative to their declaring project; paths within ordinary/tester Compose relative to that Compose file. Main override contents retain project-relative path interpretation. A mesh-authored override path resolves relative to mesh root, with provenance retained. All runtime paths are rebased to the final output directory. |
| D15 | No legacy config conversion at runtime, no V2 provider aliases, no hidden app node, no automatic inferred edges. Migration documentation supplies explicit rewrites. Preserve native Compose `depends_on`, including service_started and service_completed_successfully, inside modules. |
| D16 | No default Node-specific mounts in generated dev Compose. Put `/app`, node_modules, commands and technology-specific build arguments in example/user main overrides. Dockerfile contract requires targets dev/test/prod, dev/prod runtime commands and health, and foreground dev; no mandatory COPY --from or ban on EXPOSE. |

## Shared compiler architecture and contracts

Keep existing public `compileEnvironment`, `compileMeshEnvironment`, `compileApplicationEnv`, schema and CLI exports with V3 inputs. Remove V2 model exports. Implement shared internals under existing `src/core/config` and `src/core/composition`, and a thin mesh adapter at `src/core/mesh/compileMeshComposition.ts`. Do not add another versioned compiler tree.

Use these types in `src/core/config/types.ts` and `src/core/composition/types.ts`:

```ts
type ConfigStage = 'dev' | 'test' | 'prod' | 'e2e';
type RequisiteKind = 'requirement' | 'dependency' | 'prerequisite';
type NodeId = string; // JSON.stringify([meshRootOrNull, sourceServiceName])
type Origin = {
  sourceFile: string;
  configPath: string;
  projectDir: string;
  scope: 'build' | 'mesh';
  meshRoot?: string;
  layer: 'base' | ConfigStage;
};
type Located<T> = { value: T; origin: Origin };
type Edge = { consumer: NodeId; target: NodeId; kind: RequisiteKind; origin: Origin };
type GraphNode = {
  id: NodeId;
  kind: 'main' | 'ordinary';
  projectDir: string;
  sourceService: string;
  meshRoot?: string;
  declaration: EffectiveMain | EffectiveOrdinary;
  envLayers: EnvironmentLayer[];
};
type EffectiveGraph = {
  nodes: Map<NodeId, GraphNode>;
  roots: NodeId[];
  edges: Edge[];
  closures: Map<NodeId, Set<NodeId>>;
  lifecycle: Map<NodeId, 'long-running' | 'prerequisite'>;
};
type CompiledComposition = {
  compose: ComposeDocument;
  projectName: string;
  graph: EffectiveGraph;
  mainServiceNames: Map<NodeId, string>;
  modules: Map<NodeId, MaterializedModule>;
  endpoints: Map<NodeId, Record<string, ResolvedEndpoint>>;
  runtimeServiceNames: string[];
  testerServiceNames: string[];
  testerServiceName?: string;
  allocations: Map<string, number>;
};
```

`EffectiveMain`, `EffectiveOrdinary`, `EnvironmentLayer`, and `MaterializedModule` are specified in files 01/02. Use structured identities, not parsing namespaced Compose names to recover graph identity. Diagnostic display names are `main`, `postgres`, or `backend.source.postgres`; runtime names are a separate mapping.

Compiler phases are pure through validation. Logical adjacency/closures may be computed to validate visibility before graph evaluation; this is not materialization. Allocate ports only after semantic validation; write allocation cache only after the final Compose document validates. Start Docker only through runners. `validationMode` must have no filesystem writes or Docker starts; the explicit infrastructure checker may run read-only Docker/Conftest commands.

## Specification coverage ownership

| V3 sections / final invariant numbers | Plan owner |
|---|---|
| §§1–15, 22–46, 51–53, 82–84 Naming; invariants 1–3, 15–43, 61 | 01: types, stages, scopes, graph and validation |
| §§16–21, 47–50, 54–70, 79–81; invariants 4–14, 44–50, 59–60 | 02: endpoint/publication/env/Compose compilation |
| §§5–6, 69, 71–78; invariants 51–58 | 03: Dockerfile, runners, tests and cleanup |
| §§84 Build example–94, 95–101 and all final invariants | 04: executable coverage, migration and removal checks |

## Completion definition

Every specified negative case fails before startup except inherently runtime outcomes (job failure, unhealthy process, tester exit). Positive cases compile and run with expected reachability, env, publication and ordering. Tests verify behavior rather than only matching snapshots. All active docs/examples use V3. Every retained V2 regression is migrated or explicitly replaced by a named V3 test. All gates in file 04 pass, or the final implementation report identifies an actual unavailable execution dependency without claiming those gates passed. No publishing is part of completion.

## Specification interpretation boundaries

The spec leaves several operational details unstated or presents examples that need qualification. These are resolved above so implementation can proceed consistently; they must remain visible in review:

- §§23/34 describe base main/tester requirements, while §83 says “required tester for a testable build/mesh.” D01 uses a uniformly testable schema instead of inventing a non-testable project mode.
- §§12/45 restrict isolated reachability and cross-service references. The exhaustive build example contains base external refs and also describes isolated dev. D06 gives the normative graph/reference rules precedence over that illustrative isolated claim. The canonical JSON is tested as written, with isolated rejection documented. A later specification clarification would need an explicit change to this decision and its tests; do not silently ignore refs or fabricate external endpoints.
- §75 speaks of every reachable runtime node; §§17/18/27 establish an atomic module's lifecycle representative. D08 applies the barrier to those representatives, not every helper container independently.
- §79 recommends public tester refs but does not prohibit network refs. D10 preserves both reference grammars and leaves networking connectivity to the declared/default runner network.
- No override file service key is specified. This plan standardizes it on `services.main`, matching the V3 logical application identity, and migrates every bundled override accordingly.
- Runtime readiness timeout, cache/state formats, deterministic name candidates, direct standalone phase commands, and repeated-identical immutable declarations are implementation policies. They must not be described as quoted V3 requirements.
