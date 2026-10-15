# 07 — Environment, publication and Compose scenario catalog

Prerequisite: [05](05_TEST_STRATEGY_AND_FIXTURES.md). All scenarios here are Docker-free except the explicitly linked corroborating engine cases in file 08. Exercise the real compiler and filesystem at layer I; never replace the composition being asserted with a test-generated expected document.

## A. Environment precedence — exact parameterized families

Owner: `tests/v3/environment.test.ts`. Spec §§4, 54–64. Use EP fixtures. For each listed chain, put `VALUE` in all layers, remove the highest layer, and repeat until each individual layer wins. Assert final container environment and provenance. Preserve an unrelated unique key from every retained layer. This creates many meaningful subtests from each row without repeated Docker execution.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| ENV01 | Standalone dev/prod/test with chain dotenv→base main→stage main→selected override→internal. | Last applicable layer wins; internal execution variables authoritative. | Recipient/stage × removal table; use ordinary VALUE for user layers and separate reserved-key negative tests. |
| ENV02 | Standalone E2E chain env.e2e→base→prod→e2e→selected override→internal. | Prod structured env inherited; E2E dotenv only; selected override wins JSON layers. | Assert each boundary; give env.prod a unique sentinel and verify never read/injected. |
| ENV03 | Mesh dev/prod chain source dotenv→source base→source stage→override→mesh base extends→mesh stage extends→internal. | Mesh env outranks override/source values; no mesh root dotenv implicitly added to mains. | Table at both stages, plus root dotenv poison key; inspect each source main separately. |
| ENV04 | Global E2E source dotenv/base/prod/e2e→override→mesh base/prod/e2e→internal. | Exact nine-layer ordering; mesh base can beat source e2e. | Remove upper layers systematically; assert winning origins and compiled strings. |
| ENV05 | Ordinary module normal profile: per-container Compose defaults/env_file→source base/stage→mesh base/stage. | Same Builder env overrides every module container while unique native defaults remain. | BA api/ui/collector; both standalone and mesh; verify all three container maps. |
| ENV06 | Ordinary E2E: defaults→source base/prod/e2e→mesh base/prod/e2e. | Structured prod inherited; no app dotenv injected into module. | Layer-removal table and sentinel APP_ONLY in each app dotenv. |
| ENV07 | Standalone tester runner: implementation defaults→env.e2e-tester→base/prod/e2e tester.env. | Tester dotenv beats native environment default; JSON beats tester dotenv; app env.e2e absent. | Set same VALUE in Compose environment and tester dotenv to catch native Compose precedence inversion; assert resolved runner env. |
| ENV08 | Global tester: native defaults→root env.e2e-tester→mesh base/prod/e2e tester.env. | Source tester env/dotenv never contributes. | MM source testers carry poison sentinels; inspect global runner only. |
| ENV09 | Tester Compose has runner+helper with different native env; Builder tester VALUE specified. | D11 applies tester override to runner only; helper native VALUE remains. | Inspect both containers after compilation. |
| ENV10 | Main primary endpoint port 3100, publicPort 45100; user no PORT. | PORT='3100', never host port; EXEC_MODE/INFRA_MODE match profile. | Compile every profile row from file 08; exact env assertions. |
| ENV11 | Main no endpoints, user PORT string; then add primary endpoint. | No-endpoint user PORT allowed by policy; adding primary makes collision fail. | Stage pair with otherwise valid health metadata; assert no arbitrary PORT default. |
| ENV12 | User tries EXEC_MODE, INFRA_MODE or authoritative PORT in dotenv/base/stage/override/mesh extends, even with matching value. | Collision rejected, not silently accepted/overwritten. | Recipient layer × key matrix; FAIL winning/original offending path as implementation contract specifies. |
| ENV13 | Ordinary/tester explicitly sets EXEC_MODE/INFRA_MODE in JSON, native Compose environment or env_file. | No non-main injection/explicit reserved configuration allowed under D11. | Parameter table; check native list and map forms; don't infer unknown image internals from an empty fake. |
| ENV14 | Main unit phase env.test contains VALUE; env.dev/prod/e2e contain poison values. | Exactly env.test selected; unit isolated. | Real fixture files, read tracking, exact final env. |
| ENV15 | Missing optional dotenv; present empty dotenv; duplicate key native dotenv convention. | Missing/empty optional file succeeds; duplicate follows selected native resolver convention consistently with exporter. | Native parser/resolver fixture expected values; corroborate one representative via DOC01. |
| ENV16 | Literal value contains dollars, quotes, newline, CRLF, backslash, leading/trailing spaces, empty string and unicode. | No unwanted interpolation/trimming/double escaping; export roundtrip preserves supported literals. | Value table through resolve→serialize→parse/export; DOC01 verifies actual Compose behavior once. |
| ENV17 | Native Compose environment list has KEY, KEY=value, empty value; map has null. | Native pass-through/unset semantics preserved; Builder JSON remains strings only. | Controlled process.env; restore after test; no ambient developer env affects result. |
| ENV18 | Shadowed invalid Builder ref below selected override/mesh key; unshadowed sibling invalid ref. | Only surviving keys parsed; invalid sibling still rejected. | Real compiler with expression parser spy and expected path; controls remove winner. |
| ENV19 | Dollar-bearing env resolved across standalone→mesh pipeline. | Exactly one logical interpolation/serialization escaping pass. | Same expected string in standalone and mesh, independent YAML parser; no `$$$$` drift. |
| ENV20 | Debug output/export error involving SECRET_VALUE sentinel. | Debug/error paths redact secrets according to existing utility; actual delivered env is intact. | Capture console, compare compiled env and logs separately; no snapshot containing secret. |

## B. Endpoints, publication and host port allocation

Owner: `tests/v3/publication.test.ts`, `hostPorts.test.ts`, `endpointProperties.test.ts`. Spec §§16–21, 47–50, 70, 79–81.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| PUB01 | BG standalone integrated: main/mail have AUTO, db no publicPort. | Main/mail published; db network-only; unused no port intent. | Inspect registry, actual owner ports and allocator input list. |
| PUB02 | Same source imported into mesh without publish. | All source endpoints private despite AUTO/fixed capability. | Assert no generated ports and no public host/port; network props still present. |
| PUB03 | Mesh selects main.endpoints.http and mail.endpoints.http. | Only selected endpoint owners receive host mappings. | Compare full ports map; ensure no ports on migration or helper. |
| PUB04 | Selector includes source prefix/cross-root prefix, omits endpoints, wrong property suffix, empty string. | Selector grammar rejected. | Parameterized final publish array; FAIL source selector path. |
| PUB05 | Selector names unknown local service, unknown endpoint, dormant service, endpoint without publicPort. | Four distinct semantic errors; no implicit graph edge. | One valid surrounding mesh per mutation; no allocator/probe call. |
| PUB06 | Base selects two endpoints; stage selects one; E2E clears with []. | Final host bindings follow replacement exactly. | Compile stages and compare port intents plus property permissions. |
| PUB07 | Duplicate identical selector repeated twice. | Duplicates collapse into one intent/mapping under policy. | Count publication entries, allocator calls and Compose ports. |
| PUB08 | Two published endpoints request same fixed port, in one source and across sources. | PortConflictError includes both canonical owners and port. | Mock probe must not be needed to detect declaration conflict. |
| PUB09 | Two private/dormant capabilities request same fixed port. | No collision until both are effectively published. | Mesh stage pair changes only publish; first succeeds, second fails. |
| PUB10 | Fixed port occupies first candidate; two AUTO endpoints follow. | Fixed reserved first; AUTO gets distinct available ports excluding fixed. | Fake candidate availability [busy,free,free]; exact intent→port map. |
| PUB11 | AUTO cache has valid available prior port. | Reuse prior port; stable canonical key includes source/node/endpoint. | Actual temporary cache + fake probes; assert minimal expected probe requests. |
| PUB12 | Cached port unavailable/out-of-range/duplicate or cache JSON malformed/version wrong. | Safe reallocation or ignored bad cache; no crash or conflicting mapping. | Parameter table; only proposed valid allocations persisted after success. |
| PUB13 | Compile validation/dry-run with AUTO and poison probe/cache write adapters. | Deterministic placeholders; no probe/persistence. | Repeat two times and compare placeholders; assert adapters untouched. |
| PUB14 | Late reference/resource/Compose validation fails after port proposal. | No partial cache/run.state persisted. | Inject final validation failure in real pipeline through invalid resource, inspect before/after directory tree. |
| PUB15 | Two concurrent runtime preparations request same available port before bind. | Final startup collision check fails loser; no claim that allocation probe reserves port. | Controlled fake probe race plus W startup; no silent reassignment after env URLs serialized. |
| PUB16 | Selected fixed port is occupied by unrelated localhost listener. | Real port adapter reports collision before Docker startup. | Bind one real server on ephemeral port within process; probe it, close in finally; no shell child required. |
| PUB17 | Port scan exhausts candidates. | Clear allocation failure; no hang/cache corruption. | Inject bounded candidate iterator of three busy ports; do not scan entire real range. |
| PUB18 | Endpoint moves from one internal owner to another via valid overlay; primary changes. | network_host/ports follow final owner; primary lifecycle and main PORT use final metadata. | BA variant; compare generated owner and absence of stale mapping. |
| PUB19 | Main internal port differs across two source roots but public selections are AUTO. | URLs use each actual network port and allocated public port independently. | Exact registry/property strings; no cross-source alias contamination. |
| PUB20 | Requirement-only reachable service is published; add publication of unused service. | First valid without adding ordering; second fails reachability. | Inspect conditions unchanged for first; second preallocation rejection. |

## C. Atomic modules, ownership, paths and namespaces

Owner: `tests/v3/modules.test.ts`, `composePaths.test.ts`, `namespaces.test.ts`, migrated resource regressions. Spec §§17–18, 27, 62, 65–70.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| CMP01 | BA reachable with api/ui/collector, only api/ui endpoints. | All three materialize atomically; collector not dropped. | Count module membership, resources and cleanup identities. |
| CMP02 | BG migration endpoint-less, explicit service migrate. | Job materializes and can be requisite target without endpoints. | Inspect module representative and generated completion condition. |
| CMP03 | Ordinary Compose has empty/missing services; endpoint owner missing; explicit service missing; explicit service differs primary. | Correct validation rejection for each independent case. | I real YAML fixtures; FAIL source and path; no namespace output. |
| CMP04 | Secondary endpoint owner lacks health, representative healthy. | Valid unless native internal condition requires secondary health; no automatic all-owner health rule. | BA prod/E2E compile; tester gates representative only D08. |
| CMP05 | Module env conflicts with native container-specific env. | Builder module env wins on every member; unmatched native keys retained. | Different defaults on each member make incomplete propagation observable. |
| CMP06 | Raw ports, container_name, host network, privileged true, `/` bind or Windows host-root equivalent. | Ownership violation rejected before startup. | One mutation at a time; exercise short/long mount and port syntax. |
| CMP07 | Safe non-root bind, named/anonymous volume, consumed config/secret, internal custom network. | Preserved and rebased/namespaced correctly. | Parsed generated Compose references equal emitted resource keys; retain mount modes. |
| CMP08 | Internal depends_on/links/volumes_from/network_mode service:/ipc/pid references valid then nonexistent. | Valid references rewritten; unknown internal target fails. | Field parameter family; distinguish resource keys from literal command text. |
| CMP09 | Two modules use services db/api, network internal, volume data, config settings, secret token. | Deterministic distinct identities for every resource, no cross-links. | Map all original→runtime names; verify consumers reference their own definitions. |
| CMP10 | Names with delimiter collision possibilities and long valid identifiers. | Allocator disambiguates deterministically; no duplicate final key. | Reverse insertion order; assert same logical mapping and collision-free candidate output. |
| CMP11 | Source aliases import same directory with same build name. | Separate mains/modules/resources; project still one mesh. | Compare NodeId and final name maps; no object identity sharing. |
| CMP12 | Relative build context/Dockerfile/env_file/config/secret/bind paths in nested Compose files. | Paths resolve relative to correct source file, then final output directory. | Real files under nested directories; resolve generated paths back to absolute and compare expected fixture paths. |
| CMP13 | Main override path authored in mesh root rather than source. | Selected file and its project-relative contents rebased from authoring project; main build context protected. | Two same-named files different directories; exact content/path proof. |
| CMP14 | Source path or materialized file symlink escapes allowed root; missing required env/config/secret/build input. | Boundary/file errors before startup; optional declared env_file absence accepted as specified. | Real symlinks contained under builder fixture tree; include optional required:false control. |
| CMP15 | Module attempts include/extends/profiles or unsupported service build context references. | Explicit unsupported-policy error, not partial materialization. | Table matching retained implementation restrictions; tag as policy, not new V3 normative syntax. |
| CMP16 | Main override contains one services.main and allowed args/mounts/logging/timing. | Safe customization preserved; only selected override contributes. | COMPILE and inspect each field, resource reference and Builder-owned target. |
| CMP17 | Main override tries extra service, target/Dockerfile/context replacement, ports, depends_on, namespace/network ownership or health disable. | Protected change rejected; exact path reported. | Table with valid baseline and one forbidden property; repeat identical canonical context as valid control. |
| CMP18 | Main override build.args object includes dollar/literal values. | Args supplied through Compose only; no new Builder build-args config field. | Positive compiled args and negative root/main generic field schema case. |
| CMP19 | Generic dev template with non-Node main and no user mounts. | No implicit /app or node_modules mount; supplied override may add them. | Template parse plus compiled dev output; compare overridden control. |
| CMP20 | Module-private networks plus shared builder network, internal network_mode:service target. | Compatible members join graph network; shared-namespace member not assigned conflicting networks. | Inspect final service/network maps; owner DNS mapping correct. |
| CMP21 | Source Compose declares top-level project name or named resource identity. | Builder project/resource ownership wins or explicit unsupported ownership fails according to retained namespace policy; never leak global collisions. | Assert actual existing namespace helper's contract from plan 02, with two modules using same source names. No accept-either assertion: normalize owned names; reject unsupported external ownership. |
| CMP22 | Literal hostname in arbitrary command and native `${VAR}` interpolation in raw Compose. | No heuristic graph/ref rewrite; Builder parses its own JSON env only. | Compare command string and native interpolation text before/after serialization. |
| CMP23 | Invalid final internal resource link despite valid raw JSON schema. | Final Compose validation catches unknown target and aborts before writes. | Real integration pipeline, no mocked validator. |
| CMP24 | Prerequisite representative restart always/unless-stopped/on-failure versus absent/no. | D08 lifecycle policy rejects restart-hiding completion; absent/no accepted. | Compile with same job command and classification; exact representative path. |

## D. Lifecycle lowering, health and tester compilation

Owner: `tests/v3/composeLifecycle.test.ts`, `dockerfileContract.test.ts`, `testerCompilation.test.ts`. Spec §§3–6, 8–10, 14–18, 67–79.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| LIF01 | Main requirement mail with healthy or no-health mail in prod. | Both materialize without generated main→mail ordering; prod requirement-only health not mandatory. | Compare conditions and health-validation calls. |
| LIF02 | Main dependency db. | All consumer containers wait for db representative healthy. | BA as consumer to show api/ui/collector all gated. |
| LIF03 | Main prerequisite migration. | Completion condition emitted; no forced service_healthy. | Parsed final YAML exact condition plus absence of health demand on job. |
| LIF04 | Native internal short depends_on, long service_started/healthy/completed_successfully with metadata. | Native conditions preserved; no global healthy rewrite. | Parameter table; inspect required/restart fields retained for native edge. |
| LIF05 | Combining internal helper edge with generated module gate creates actual Compose cycle. | Concrete cycle rejected even when logical module graph alone acyclic. | Construct two modules with representative/helper edges so cycle is real; assert final cycle path. |
| LIF06 | Requirement-only service healthy in prod; same module no health in E2E. | Prod succeeds; E2E rejects because full barrier needs health. | Compile same declarations under profiles; failure reason names E2E barrier. |
| LIF07 | Main Dockerfile aliases dev/test/prod with inherited CMD/ENTRYPOINT and health. | Required contract satisfied without test-e2e. | Pure Dockerfile metadata evaluator; no Conftest Docker invocation. |
| LIF08 | Missing one canonical target; inherited HEALTHCHECK NONE; missing runtime command. | Contract errors distinguish target/health/runtime instruction. | Three-target fixture mutation family; assert main target-specific path/message. |
| LIF09 | Non-Node Dockerfile with EXPOSE, no artifact COPY --from, effective ENTRYPOINT. | Technology-agnostic valid contract accepted. | Actual parser/policy evaluator; golden Dockerfile fixture. |
| LIF10 | Dev command daemonizes; foreground command valid. | Dev foreground contract enforced without banning legitimate unrelated words. | Known explicit daemon patterns and valid near-miss string cases; label heuristic policy limits. |
| LIF11 | Dependency image has inherited enabled health, explicit Compose health override, disable:true or NONE. | Effective enabled health accepted; explicit disable defeats inheritance. | Docker-shaped metadata fixture; test resolver precedence without daemon. |
| LIF12 | Required image health metadata unavailable at pure compile then runtime lookup fails. | Deferred check explicitly recorded; real preflight failure prevents up. | I→W boundary; no success marked from absence of metadata. |
| LIF13 | E2E BG full barrier. | Runner conditions cover main/db/mail healthy and migration completed, no unused node. | Exact map equality against four expected representatives. |
| LIF14 | Main has no public endpoint and tester references only mail. | Main still must be healthy before tester. | Inspect mandatory main barrier independent of URL usage. |
| LIF15 | Tester Compose runner named custom-runner, helper exits early. | Returned selected runtime identity maps required service; all helpers included atomically. | Compile metadata, membership and runner depends_on; runtime status handled in RUN tests. |
| LIF16 | Tester image-only versus build with arbitrary target runner-final. | Preserve implementation; no injected target test-e2e or lifecycle vars. | Parameter family standalone/global; compare original build target/image to compiled. |
| LIF17 | Tester selected service nonexistent; prohibited endpoints/requisites; raw host ports/privileged/root mount. | Schema or module validation rejects each at correct layer. | Independent valid fixtures prevent earlier unrelated errors. |
| LIF18 | Tester omitted networking, explicit host, explicit bridge network. | D10 defaults unspecified runner to host, honors explicit choices and attaches bridge appropriately. | Compile both source/global testers; ensure no simultaneous network_mode:host and networks. |
| LIF19 | Source testers present in mesh dev/prod/global E2E. | None materialize; only mesh tester in global E2E. | Exact service set and env sentinels across profiles. |
| LIF20 | Requisite-only cycle has no readiness cycle; tester barrier waits on both representatives. | Compilation succeeds; no fake dependency cycle from requirement edges. | Two-node cycle plus runner; compare generated acyclic condition graph. |
| LIF21 | Tester helper depends on runner while runner native edge depends on helper. | Invalid tester-internal ordering cycle rejected. | Shared tester compiler for standalone/mesh; assert no startup. |
| LIF22 | Dependency representative missing health but another endpoint owner has health. | Fails representative requirement; secondary health cannot substitute. | BA switch primary owner and inspect precise error. |
