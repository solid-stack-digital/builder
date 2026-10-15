# 01 — Configuration, effective overlays, references and service graph

Prerequisite: [00_IMPLEMENTATION_CONTRACT.md](00_IMPLEMENTATION_CONTRACT.md). This file replaces the V2 semantic model. It does not start containers or persist runtime files.

## 1. Replace public types and structural schemas

Edit `src/types/index.ts`, `src/core/buildSchema.ts`, `src/core/mesh/types.ts`, `src/core/mesh/meshSchema.ts`, `src/core/config/constants.ts`, `src/core/config/types.ts`, `src/utils/getBuildJson.ts`, and `src/core/mesh/getMeshJson.ts`.

Use the following shapes verbatim as the public domain model (interfaces or equivalent aliases are acceptable):

```ts
type Env = Record<string, string>;
type PublicPort = number | 'AUTO';
type Requisites = Record<string, 'requirement' | 'dependency' | 'prerequisite'>;
type RequisiteOverlay = Record<string, 'requirement' | 'dependency' | 'prerequisite' | false>;
interface MainEndpoint { port: number; publicPort?: PublicPort; primary?: boolean; scheme?: string }
interface ServiceEndpoint extends MainEndpoint { service: string }
interface MainService {
  env?: Env;
  endpoints?: Record<string, MainEndpoint>;
  requisites?: Requisites;
  'override-compose'?: string;
}
interface TesterService { compose: string; service: string; env?: Env }
interface OrdinaryService {
  compose: string;
  service?: string;
  env?: Env;
  endpoints?: Record<string, ServiceEndpoint>;
  requisites?: Requisites;
}
interface MainOverlay {
  env?: Env;
  endpoints?: Record<string, Partial<MainEndpoint>>;
  requisites?: RequisiteOverlay;
  'override-compose'?: string;
}
interface TesterOverlay { compose?: string; service?: string; env?: Env }
interface OrdinaryOverlay {
  compose?: string;
  service?: string;
  env?: Env;
  endpoints?: Record<string, Partial<ServiceEndpoint>>;
  requisites?: RequisiteOverlay;
}
interface BuildStage { services?: Record<string, MainOverlay | TesterOverlay | OrdinaryOverlay> }
interface BuildJson {
  $schema?: string;
  name: string;
  services: Record<string, MainService | TesterService | OrdinaryService> & {
    main: MainService;
    tester: TesterService;
  };
  dev?: BuildStage; prod?: BuildStage; test?: BuildStage; e2e?: BuildStage;
}
interface MeshSourceService {
  source: string;
  extends?: Record<string, MainOverlay | TesterOverlay | OrdinaryOverlay>;
  publish?: string[];
}
interface MeshSourceOverlay {
  source?: string;
  extends?: Record<string, MainOverlay | TesterOverlay | OrdinaryOverlay>;
  publish?: string[];
}
interface MeshStage { services?: Record<string, MeshSourceOverlay | TesterOverlay> }
interface MeshConfig {
  $schema?: string;
  name: string;
  services: Record<string, MeshSourceService | TesterService> & { tester: TesterService };
  dev?: MeshStage; prod?: MeshStage; e2e?: MeshStage;
}
```

The unions in records are TypeScript representations only. They must NOT allow `services.main` to pass as an ordinary service or allow a source to pass as a tester. Dispatch validation by key. Add type guards `isTesterEntry`, `isMeshSourceEntry`, `isMainEntry` and use them at record iteration sites; avoid `any` casts throughout the new compiler.

Keep `Environment` as a public alias of `ConfigStage` to avoid gratuitously changing the compile API, but distinguish it from `ExecutionMode = 'dev' | 'test' | 'prod'`, `InfraMode`, `ServiceStage` workflow selection and `MeshConfigStage`. Remove testerTarget from execution profiles. Mesh stage constants are dev/prod/e2e; mesh command constants dev/prod/test.

### Validation rules and Zod implementation

1. Every schema object is strict, including nested endpoint and overlay objects. Reject root `dockerfile`, root/overlay `app`, root `dependencies`, `dependsOn`, root tester, mesh path, direct mesh env and mesh test. The canonical main Dockerfile is `<project>/Dockerfile`.
2. Require nonempty name, compose/source/service/path strings; reject whitespace-only required strings. Preserve strings rather than trim paths silently.
3. Service and endpoint identifiers use `^[a-z][a-z0-9-]*$`. Mesh root `main` is invalid; mesh `tester` is special. Build `main` and `tester` cannot use ordinary fields.
4. Ports are integers 1..65535; publicPort accepts only that range or uppercase AUTO. Scheme uses `^[A-Za-z][A-Za-z0-9+.-]*$`. Primary is boolean, never truthy coercion.
5. All Builder env values are strings. Do not coerce numbers/null/booleans. Compose-native environment null remains a separate lower-level type.
6. Base requisites accept only the three strings. Build base/overlay requisite keys are local service identifiers. Mesh extends requisite keys are either one identifier or `source.<identifier>`. Do not accept arbitrary dotted paths as requisite keys.
7. Base main endpoints may be absent or empty. Ordinary endpoints may be absent/empty only with a top-level lifecycle service. Exactly one primary is required for every nonempty effective collection. Partial overlay endpoints are validated after merge, not treated as complete base endpoints.
8. Tester accepts exactly compose, service, env; no endpoints, requisites, source, publish or override-compose. A tester overlay cannot introduce those fields either.
9. Build overlay may create only new ordinary services. It cannot create/replace kinds for main/tester. New ordinary declarations are checked for full required shape after merging that layer; missing compose cannot be supplied by a later unrelated stage.
10. Mesh overlay may create source entries with source. Mesh tester is inherited from base. Extends only modifies existing effective source keys, including source-stage additions. `extends.tester` may modify its allowed fields but never includes that local tester in a mesh runtime or global tester env.
11. JSON Schema must mirror key dispatch: `properties.main`, `properties.tester`, ordinary `additionalProperties`, and `propertyNames`. Mesh requires tester and at least one additional property, disallows main. Overlay objects have explicit reserved-key schemas and partial ordinary/source additional properties. Do not expose a permissive union under every property.
12. Use schema refinements for declaration shape where JSON Schema cannot encode it; emit equivalent `if/then` or `anyOf` constraints in `scripts/generate-schemas.ts` for endpoint-less service, required special keys and mesh source count. Cross-stage immutability and graph checks remain semantic compiler validation; label that boundary in schema documentation.

Generate schema definition names `BuildJsonV3` and `MeshJsonV3`; retain published schema file paths/URIs. Test the generated documents, not only the Zod validators. Do not hand edit generated JSON.

### Required schema tests

Create `tests/v3/schema.test.ts` with positive minimal build/mesh, endpoint-less service, multi-endpoint service, every overlay and source addition. Table-test every removed key at its actual invalid location; special-kind spoofing; missing required keys; tester-only mesh; reserved main source; invalid port/scheme/env/requisite; false in base; unknown nested field. Test legitimate ordinary `app` and `dependencies` identifiers under services to distinguish removal of fields from removal of names.

## 2. Implement generic merge with provenance

Replace `stageMerge.ts` helpers with `mergeEffectiveObject(base, patch)` and domain-aware `applyServiceOverlay`. Generic merge rules:

- Clone both inputs; never mutate parsed JSON or reuse mutable maps between profile compilations.
- Plain records recursively merge by key.
- Scalars/arrays replace; clone replacement arrays. An empty array clears the inherited array.
- Schema rejects null where it is not a permitted type. Generic merge must not treat null as an object or deletion.
- Requisite maps use canonical edge identity and false deletion, handled separately from ordinary recursion.
- A path-valued leaf retains its winning origin. Each env key retains its winning layer and lexical scope even after source import.
- No `unionStable` use for V3 publication or configuration arrays. If a lower-level set helper remains for network attachment, rename it to avoid implying stage semantics.

Normalize effective services to discriminated values:

```ts
type EffectiveMain = MainService & {
  kind: 'main'; env: Env; endpoints: Record<string, MainEndpoint>;
  requisites: Requisites;
};
type EffectiveOrdinary = OrdinaryService & {
  kind: 'ordinary'; env: Env; endpoints: Record<string, ServiceEndpoint>;
  requisites: Requisites;
};
```

Keep a separate `Located` provenance map for env/path/edge leaves; never serialize internal `kind` or provenance into user config. The compiler's normalized edge map is authoritative after mesh import; the public `requisites` strings are retained only for diagnostics.

### Build resolution algorithm

Implement `resolveBuildStage(build, stage, sourceFile)`:

1. Copy base services and tag each value with build origin.
2. Apply dev, prod, test, or prod then e2e according to `stageOverlayChain`.
3. For each service patch in deterministic key order, resolve its kind by name and inherited declaration. Check compose immutability before merge. Same string is allowed; a different one is rejected with old/new origins.
4. Introduce a new ordinary declaration only if complete. Merge endpoints deeply. Delete requisite edges with false and retain all unrelated edges.
5. Select the last override-compose path; discard old paths from the effective selected-file slot. Preserve source env layers for precedence calculation in file 02.
6. Validate effective kinds, ports, primaries, and endpoint-less representative presence. Do not load Docker/Compose, allocate ports, or parse env references here.
7. Return effective services and ordered layer provenance. Strip stage containers from the effective public object.

A false deletion retained in a mesh overlay must not be consumed while merging raw mesh layers: it must later act on the imported source edge. This distinction is essential. Keep the list of mesh base/prod/e2e extends layers as operations until source application, even if other mesh fields have already been merged.

### Mesh resolution and source loading algorithm

Replace `resolveMeshStage.ts`; create `src/core/mesh/loadMeshSources.ts` and `applyMeshExtends.ts`.

1. Merge effective top-level mesh entries from base and active stages. Check immutable source/compose while applying each layer. Publish arrays replace. Retain base root membership separately for test Phase 1.
2. Resolve each source directory relative to mesh root using existing canonical path safety. Load/structurally validate its build once per path but create independent effective instances per mesh root. Two source aliases must not share mutable effective objects or runtime identity.
3. Resolve the source stage with build resolver. Import nodes as `[meshRoot, localService]`. Canonicalize original build requisites to those local node identities BEFORE applying mesh extends.
4. Apply mesh base extends, then active mesh stage extends in order, directly to effective source services. In E2E order is source base/prod/e2e, then mesh base/prod/e2e. Never interleave mesh prod before source e2e.
5. Check extends target existence after source overlays, then check patch kind. This permits a source e2e-added fixture to be extended during mesh E2E but rejects it in dev.
6. Resolve a mesh-authored requisite `source.x` to `[currentMeshRoot,x]`. Resolve unprefixed `backend` to `[backend,'main']`. Reject tester and nonexistent targets. Apply deletion/replacement to canonical IDs, so `source.backend:false` removes an inherited build `backend` edge while `backend:'requirement'` adds a different mesh edge.
7. Record all final env entries with lexical origin. Do not rewrite strings heuristically or perform provider substitution. Mesh extends env overrides can completely shadow stale source references.
8. Validate final source endpoint/kind shapes. Do not invoke standalone reference validation on imported sources before mesh rewrites. Standalone checks and mesh checks are distinct compilation contexts.
9. Return effective source instances and mesh tester config. Source testers are declarations only and excluded from normal mesh graph construction.

Tests: `tests/v3/stages.test.ts` and `tests/v3/meshScopes.test.ts`. Assert array replacement/empty clearing; deep endpoint merges; identical/different immutable values; stage addition completeness; false deletion/no-op; raw mesh tombstones preserved until source merge; source-local versus mesh same-name edges; extension of a stage-added source service; nonexistent extends; independent aliases; source E2E value overridden by mesh base; no stale references resolved.

## 3. Compile a logical graph without runtime side effects

Create `src/core/config/serviceGraph.ts`; adapt `lifecycleGraph.ts` to accept ordering edges with diagnostics. Functions:

```ts
buildDeclaredGraph(input: EffectiveComposition): DeclaredGraph;
selectReachableGraph(declared: DeclaredGraph, profile: ExecutionProfile): EffectiveGraph;
computeClosure(start: NodeId, adjacency: ReadonlyMap<NodeId, readonly Edge[]>): Set<NodeId>;
validateGraphLifecycle(graph: EffectiveGraph): void;
```

`EffectiveComposition` contains the final standalone source or all mesh source instances, selected tester and origin maps. `DeclaredGraph` contains all non-tester effective nodes and resolved edges, before active reachability filtering.

Algorithm:

1. Validate requisite key targets against the relevant effective declarations. A reference to tester is always invalid. Do not add edges for env references, endpoints, or publish.
2. Standalone roots = main; mesh roots = every effective non-tester top-level source main, sorted by identifier.
3. Isolated profile returns main and no traversed external edges. Integrated profile uses a visited-set DFS/BFS following all three requisite kinds. Mark visited before recursion, so requirement cycles terminate. Deduplicate by NodeId.
4. Compute each active node's transitive closure with the same three edge kinds. Include self explicitly for reference authorization. Root membership alone never grants another node reference permission.
5. Classify each active target by incoming ordering kinds. Requirement-only target defaults long-running. Dependency plus requirement stays long-running. Prerequisite plus requirement becomes prerequisite. Dependency plus prerequisite fails with both edge origins, including across source boundaries. Main may not be prerequisite-classified.
6. Form an ordering graph using ONLY dependency and prerequisite edges. Run deterministic DFS with gray/black states and a recursion stack to extract the cycle. On failure emit the cycle with each edge kind. Requirement cycles do not fail. A mixed cycle containing a requirement is legal if the ordering-only subgraph is acyclic.
7. Return roots, nodes, edges, closures and lifecycle classes. Do not impose global topological startup on requirements.

Graph errors use `ConfigError` with sourceFile/configPath/stage/composition/referencedObject/reason. Render node display paths, never the opaque JSON tuple. Preserve secret redaction; no env values in graph diagnostics.

Tests in `tests/v3/graph.test.ts`: unreachable declaration excluded; transitive inclusion; independent mesh roots included; stage-only mesh root included; stage-only local node excluded until required; all three edges; requirement self/cycle; ordering self/cycle; dependency/prerequisite mixed cycle; requirement plus dependency valid; requirement plus prerequisite valid; global classification conflict; shared target once; endpoint-less reachable node; tester not root/target; isolated empty external closure; main prerequisite rejection.

## 4. Parse and authorize effective references

Rewrite `src/core/config/references.ts` and replace mesh-specific V2 reference utilities with the same graph registry. Parsed references contain target NodeId, endpoint, property and the original expression/origin.

Accepted grammars:

| Origin | Syntax | Target |
|---|---|---|
| Build source | `<local>.endpoints.<endpoint>.<property>` | That source's local node |
| Mesh extends | `source.<local>.endpoints.<endpoint>.<property>` | Current source's local node |
| Mesh extends/global tester | `<mesh>.source.<local>.endpoints.<endpoint>.<property>` | Named source node |
| Standalone tester | `<local>.endpoints.<endpoint>.<property>` | Standalone node |

The source-relative mesh form follows §40's source namespace. Do not accept short `<mesh>.endpoints`, `.app.`, or `.dependencies.` paths. A local service actually named app/dependencies is allowed via the canonical local grammar.

1. Select surviving env entries using file 02's full precedence (including the selected override file) BEFORE collecting references. Do not collect from shadowed values or inactive tester env.
2. Preserve existing `$$` literal escaping behavior. Treat `${...}` in Builder JSON env as a Builder expression and reject malformed/unknown properties. Compose-native shell/environment interpolation remains Compose's domain; do not run the Builder parser indiscriminately through commands, mounts or raw Compose files.
3. Require target node to be self or in the referencing node's closure. For tester, permit any active graph node. A target that is a different mesh root but outside the consumer's closure remains unauthorized.
4. Require endpoint existence and URL scheme for URL properties. Public properties require selected effective publication; private network properties do not.
5. Authorize first; interpolate actual values after endpoint host/public port registry is constructed. Therefore no stale or unauthorized reference can trigger port allocation.
6. Interpolate multiple expressions embedded in text; stringify numeric port values; preserve surrounding text and literals. Escape dollars once for Compose serialization, never twice during successive env layers.
7. Keep user-facing source location for the winning entry. Unknown endpoint, missing edge and missing publication are distinct diagnostics with an actionable canonical requisite/publish path.

Test `tests/v3/references.test.ts`: self without edge; direct/transitive closure; unrelated materialized root denied; pruned surviving ref fails; pruned shadowed ref ignored; cross-source nested endpoint; source-origin local ref after mesh import; source-relative mesh ref; tester full graph visibility; tester cannot pull dormant node; all eight properties; URL without scheme; private public ref; malformed grammar; escaped dollar and multiple refs; inactive tester ignored; isolated external ref fails.

## 5. Resolve publication intent before allocating ports

Create `src/core/config/publication.ts`, reusing property helpers from `endpointProperties.ts`. Delete provider-aware publication algorithms when callers migrate.

Standalone: select every endpoint with effective publicPort on active nodes. Mesh: initialize all endpoints private. For each effective source entry, process its final publish array (replacement semantics): parse exactly `<local>.endpoints.<endpoint>`, require the local node exists and is in that source main's closure, require endpoint and publicPort. Do not accept `source.` or cross-root selectors. Deduplicate identical selectors as a set without creating duplicate mappings. Missing selections remain private even when their source defines fixed/AUTO publicPort.

Return sorted `PublicationIntent { nodeId, endpoint, requestedPort, origin }[]`. Perform fixed duplicate-request detection across the entire selected graph. Never allocate ports for private or dormant endpoints. A private duplicate fixed capability is harmless; two published endpoints requesting the same host port fail. Property validation can determine “public or private” from intent before concrete AUTO allocation.

Tests `tests/v3/publication.test.ts`: standalone active endpoints published; dormant ignored; mesh default private; source-relative selector accepted; source prefix rejected; missing node/endpoint/publicPort rejected; unreachable selector rejected; inherited list replaced/cleared; global duplicates rejected; private fixed duplicates accepted; repeated selector emits once; no new graph edges.

## 6. Gate before Compose implementation

Run focused schema/stage/scope/graph/reference/publication tests. Confirm these functions do not spawn Docker or write `.builder`. Verify fixtures cover spec invalid examples §§87–94 and graph examples §§85–86. Leave materialization integration assertions to file 02, but do not change their semantic expectations to match legacy compiler output.
