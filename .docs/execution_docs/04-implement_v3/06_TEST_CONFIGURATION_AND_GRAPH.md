# 06 — Configuration and graph scenario catalog

Read [05](05_TEST_STRATEGY_AND_FIXTURES.md) for fixtures, layers and common assertions. Every row specifies how to cause the situation, expected result, and concrete test method. All cases in this file run without Docker. Unless specified otherwise, compile integrated prod; use real temporary JSON/YAML for I cases and immutable objects for U cases. An invalid scenario must fail for the intended reason, not an unrelated missing tester/file/health error.

## A. Parsing, schemas and reserved kinds

Owner: `tests/v3/schema.test.ts`, `schemaParity.test.ts`, `loading.test.ts`. Spec §§3, 16–28, 33–39, 54, 83–84 Naming, 95–96. U unless file reading is stated.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| CFG01 | Parse B0 and MM with canonical `$schema`, then omit `$schema`. | Both variants accepted; schema URI is optional metadata. | Run actual Zod schema and generated JSON Schema validator against same objects; compare accepted service kinds. |
| CFG02 | Remove name; separately use empty and whitespace-only names. | Missing name fails spec rule; blank values fail D01 policy. | Parameterized safeParse and public loader test; FAIL(name); no directory-name fallback. |
| CFG03 | Remove services; replace with array/null/string; remove main from build. | Structural rejection at correct root/main path. | One test per mutation; assert neither compiler nor file loading advances past parsing. |
| CFG04 | Remove base tester from build/mesh; mesh contains tester alone. | D01 rejects untestable base and mesh without source root. | Schema parity tests and public compiler entrypoint; distinguish policy label from general §83 rejection. |
| CFG05 | Put compose/service on main; endpoints/requisites on tester; source/publish on ordinary build service. | Key-specific schema rejects fields; no union branch accepts spoofed kind. | Parameterize reserved service and illegal field; FAIL on that exact nested property. |
| CFG06 | Name a mesh source main; use tester with source shape. | Reserved special-kind misuse rejected. | Actual mesh schema; separately show valid tester plus backend source succeeds. |
| CFG07 | Ordinary service identifiers `a`, `api-2`, `app`, `dependencies`, `dev`; invalid `A`, `1a`, `a_b`, `a.b`, space, empty. | Canonical regex enforced; V2 structural words may be ordinary names under D02. | Parameterized build/mesh identifiers; exclude special main/tester branches from ordinary success list. |
| CFG08 | Add unknown root/stage/main/ordinary/tester/endpoint/extends fields, including typo `publicport`. | Strict rejection at every schema depth. | Run one mutation at a time with complete valid parent; assert generated schema does not silently allow additionalProperties. |
| CFG09 | Add legacy root app/dependencies/tester/dockerfile; dependsOn on service; mesh path/direct env/provider dependencies. | All invalid locations rejected with migration-oriented paths. | Schema + public compile table; also prove legitimate service named dependencies still works. |
| CFG10 | Build stages dev/prod/test/e2e; mesh dev/prod/e2e; add mesh test or `staging`. | Exact stage sets accepted; mesh test/unknown rejected. | Parse every case; invoke direct mesh compiler on unsupported stage via runtime cast and expect rejection. |
| CFG11 | Main/ordinary/tester/mesh extends env values set to number, boolean, null, array, object, then string equivalents. | Only string values accepted; no coercion. | Cartesian table recipient × value type; inspect parsed strings exactly. |
| CFG12 | Ordinary compose missing, blank, number; mesh source missing/blank; tester compose/service missing/blank. | Required declarations fail. | Test base declarations and newly introduced stage services; assert field path rather than generic union error alone. |
| CFG13 | Base requisite values requirement/dependency/prerequisite versus false/true/unknown/null. | Three values accepted; false only legal in overlay. | Pure schema table for main/ordinary base and overlay; overlay false accepted structurally. |
| CFG14 | Build requisite key db versus source.db / backend.source.main; mesh extends keys backend and source.db versus source.db.x. | Context grammar enforced; valid local/mesh forms distinguished. | Schema or semantic parser tests with matching declarations; valid references resolve expected IDs. |
| CFG15 | Port 1/65535; port 0/65536/-1/1.5/string; publicPort AUTO versus auto/null/true. | Only bounded integers and uppercase AUTO accepted. | Endpoint matrix for main/ordinary, base and final patched endpoint. |
| CFG16 | Scheme http/HTTPS/git+ssh/a.b/a-b versus 1http/http:// /empty/space; primary nonboolean. | Regex and boolean rules enforced. | Table over base endpoints; preserve original scheme spelling in parsed object. |
| CFG17 | Ordinary empty/absent endpoints with valid service; then remove service. | Endpoint-less declaration valid only with representative. | Schema and effective validation; empty object and omitted field tested independently. |
| CFG18 | One primary endpoint; zero primary; two primaries; omitted primary on secondary. | Exactly one for nonempty collection; omission means false. | Pure effective validator, then compiled primary PORT/representative assertion. |
| CFG19 | Empty main endpoints versus ordinary endpoint missing owner service; top-level service contradicts primary. | Main without endpoints valid; ordinary missing/mismatched representative invalid. | Effective validation with complete Compose metadata for owner mismatch. |
| CFG20 | New stage ordinary service supplies full declaration versus only env; extends tries to create missing source service. | Full stage addition accepted; incomplete addition and extends creation rejected. | resolveBuildStage/applyMeshExtends with source stage selected; FAIL points to introduction. |
| CFG21 | Write malformed JSON, valid JSON primitive, missing build file, malformed source build, unreadable Compose. | Actionable file/path-specific errors; no swallowed parse errors. | I: loader/compiler over real temp files; inject EACCES in narrow file-open adapter when platform permissions cannot reproduce it. |
| CFG22 | Source path points to directory without build.json, missing directory, path escape, symlink escaping fixture root. | No unintended source load or outside-root read; contained source accepted. | I with sibling directories inside test temp root; fake outside sentinel path under builder to avoid external edits; assert boundary diagnostic. |
| CFG23 | Generate JSON schemas from production schema definitions once. Validate all CFG data with both validators. | Acceptance/rejection parity; V3 definitions and required special keys; no V2 definition names. | Use Ajv as test-only dependency, strict configuration compatible with emitted schema draft; compile validators once per worker. Do not imitate JSON Schema with handwritten checks. |
| CFG24 | Parse prototype-like/unknown keys and non-plain JSON object structures at nested locations. | No prototype pollution or inherited-property acceptance. | JSON.parse payload with own `__proto__` key, assert Object.prototype unchanged; strict validation rejects invalid service names/unknown fields. |

## B. Effective merge and stage/source provenance

Owner: `tests/v3/stages.test.ts`, `meshScopes.test.ts`. Spec §§28–46, 51–53, 58–64. Test U and at least one I case per category.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| MER01 | Base main env A/B; stage changes A and adds C. | A replaced; B retained; C added; base input untouched. | Deep-freeze input and compare final env plus original object. |
| MER02 | Base endpoint port/publicPort/primary/scheme; overlay only publicPort. | Other endpoint fields retained recursively. | Resolve stage and inspect complete endpoint; do not shallow snapshot only patched field. |
| MER03 | Base publish [main.http, mail.http]; stage publish [mail.http], then []. | Array replaces exactly; empty clears. | Resolve MM publication and compare final selectors/ports; no stable union. |
| MER04 | Base scalar override-compose A; prod B; e2e C. Make A/B invalid or nonexistent. | E2E uses C only; superseded files are not read. | I compile with read spy for filenames; C valid; no false failure from discarded content. |
| MER05 | Base ordinary compose path A; overlay repeats A then changes to B. Same for tester and mesh source. | Identical repeat allowed D03; changed immutable value rejected. | Parameterize declaration kind and layer; assert old/new origin information. |
| MER06 | Resolve dev, prod, test, E2E from base with distinct stage markers. | dev/prod/test inherit base plus own stage; E2E inherits base→prod→e2e; test/dev do not leak. | Exact per-key expected map and selected layers in each profile. |
| MER07 | E2E overlay overrides prod scalar/env but omits another prod key. | Override wins; untouched prod key survives. | Include tester and ordinary env, not just main. |
| MER08 | Base main→db dependency; overlay false; target still declared. | Edge removed, declaration retained, db dormant absent another path. | Inspect effective declaration, graph and generated services; never interpret false as new edge. |
| MER09 | Delete absent edge to existing service twice; delete edge to unknown service. | Existing-target no-op idempotent D04; unknown target rejected. | Resolve sequential overlays and compare output; assert semantic target error for unknown case. |
| MER10 | Stage changes existing edge dependency to requirement/prerequisite. | One final edge with new kind; no stale classification/order survives. | Compile each replacement; remove conflicting other incoming edges to isolate result. |
| MER11 | Prod adds ordinary job with full compose/service; E2E extends job env and makes it requisite. | Effective E2E job valid and active; base/dev do not contain it. | Resolve all stages; inspect node set and final env origin. |
| MER12 | Stage adds incomplete endpoint patch to existing versus new endpoint. | Existing endpoint can inherit required fields; new endpoint must become complete. | Overlay endpoint table; assert effective missing port/owner error only for incomplete new endpoint. |
| MER13 | Overlay primary true on second endpoint without clearing first; then explicitly set first false. | First variant invalid; second valid and changes PORT/representative. | Compile and inspect actual primary consumer values. |
| MER14 | Source base/dev/prod/e2e and mesh base/dev/prod/e2e all write same marker. | Source full chain precedes mesh chain; mesh base beats source e2e, then mesh e2e wins. | Remove mesh upper layers one at a time; assert exact origins and values. |
| MER15 | Source inherits local backend edge; mesh deletes source.backend and adds unprefixed backend edge. | Local mock pruned; fellow root main reached; no string-name conflation. | MM compile: inspect tuple node IDs, generated containers and reference values. |
| MER16 | Mesh base false tombstone; mesh prod/e2e changes other fields only. | Tombstone survives raw mesh merge until applied to imported source edge. | Assert local edge absent after all source stages; regression against generic merge consuming tombstone early. |
| MER17 | Source E2E introduces fixture-loader; mesh E2E extends it; mesh dev attempts same extension. | E2E succeeds; dev rejects nonexistent effective target. | Compile stage pair from same immutable source fixtures. |
| MER18 | Two mesh roots import same source directory and override same env differently. | Distinct effective instances, closures and container identities; neither mutation leaks. | Compile both, then reverse insertion order; compare logical maps per alias. |
| MER19 | Build-origin env refers local backend; mesh-origin env refers source.backend or other.source.main. | Each surviving value retains its lexical scope. | Put distinct port/name values on same-named local/global targets; assert selected target IDs. |
| MER20 | Mesh extends source tester env and attempts ordinary runtime run. | Source tester remains excluded; global tester env unchanged. | Compile mesh dev/prod/E2E; assert only global tester in E2E. |
| MER21 | Mesh stage adds root inspector or audit with source; no incoming requisite. | Addition is active root only for its stage. | Node/root set equality for dev/prod/E2E; verify publish omission means private. |
| MER22 | Compile prod, E2E, dev, prod again from same frozen configs. | First and last prod semantically identical; no profile mutation/cache contamination. | Compare canonical graph/env/publication maps; fake deterministic port allocation. |
| MER23 | Replace overlay fields with null or false outside requisites. | No implicit deletion semantics accepted. | Parameterize env map, compose, endpoint, source, services, override-compose; schema rejection. |
| MER24 | Main override path supplied in source then mesh extends, each rooted in different project. | Winning path uses authoring origin and final path rebasing. | I: put different marker YAML files at same relative name under both roots; assert selected contents and resolved paths. |

## C. Reachability and ordering

Owner: `tests/v3/graph.test.ts`, graph portions of compiler integration. Spec §§7–15, 27, 39, 45, 69, 75–78.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| GRF01 | BG integrated prod. | Exactly main/db/migration/mail active; unused absent. | Graph node set and Compose membership; inspect no read/allocation for unused. |
| GRF02 | BG isolated dev and unit. | Main only; no traversed external edges, modules/tester/ports. | COMPILE twice; allow main public capability only, no external host intents. |
| GRF03 | main requirement a; a dependency b; b prerequisite c. | All four reachable; ordering only a→b and b→c. | Closure per node and concrete condition assertions. |
| GRF04 | Diamond main→a,b; both→db. | db materialized once; each path retained for visibility; unique resource allocation. | Count actual module/container names and port probe calls. |
| GRF05 | main requirement a; a requirement main; self requirement on a. | Allowed, finite traversal, each node once. | Real graph algorithm; test has ordinary 2-second deadline, no fake result. |
| GRF06 | Dependency self-edge; prerequisite self-edge. | Ordering-cycle rejection. | Parameterized edge kind; assert cycle contains self and kind. |
| GRF07 | a dependency b; b prerequisite a. | Combined ordering cycle rejected. | FAIL includes both kinds and paths; no materializer invocation. |
| GRF08 | a dependency b; b requirement a. | Legal: ordering subgraph acyclic. | Assert generated ordering only a→b; requirement does not produce b→a. |
| GRF09 | Two incoming requirement+dependency to db. | Long-running classification; healthy ordering only for dependency consumer. | Inspect lifecycle map and consumer-specific Compose edges. |
| GRF10 | Two incoming requirement+prerequisite to job. | Prerequisite classification; completion barrier, not health. | Compile E2E and inspect tester condition to job. |
| GRF11 | One consumer dependency db; another prerequisite db, including different mesh roots. | Conflict rejected globally before startup. | Two variants standalone/mesh; assert both edge origins in diagnostic. |
| GRF12 | Two distinct nodes each locally named db, one dependency and one prerequisite. | No false global classification conflict across source scopes. | Distinct NodeIds; independent lifecycle classes. |
| GRF13 | Unknown requisite target; target tester; main targeted as prerequisite. | Unknown/tester rejected normatively; main prerequisite rejected D09 contract policy. | Test separately to preserve reason; assert no implicit declaration/materialization. |
| GRF14 | Main endpoint-less but valid Dockerfile; ordinary job endpoint-less with explicit service. | Both possible; job reaches via requisite, main has no Builder PORT. | COMPILE and inspect membership, target and env. |
| GRF15 | Stage adds unused ordinary service with invalid runtime Compose path. | Declaration shape checked but inactive path not opened under D05. | I compile and read spy; add requisite in second test and expect file error. |
| GRF16 | Mesh has unrelated roots a/b, no mutual edges. | Both active; root a's closure does not automatically include b. | Compare global node set versus per-consumer closure; reference failure tested in REF05. |
| GRF17 | Fellow-root requisite points to backend main with nested db/migration. | Consumer closure includes target main and its reachable subtree. | MM frontend closure includes backend db; shared backend subtree materialized once. |
| GRF18 | Publish/ref points at dormant node but no requisite. | Node remains dormant; invalid publication/ref fails instead of adding edge. | Capture graph before error; assert no node-count change or file reads. |
| GRF19 | Reorder services/requisites JSON insertion order. | Same graph sets, lifecycle classification and deterministic generated identities. | Shuffle with fixed seed 17 across 20 permutations; compare sorted semantic result. |
| GRF20 | Chain of 300 nodes plus requirement back-edge and shared branches. | Terminates, complete closure, no duplicate materialization. | Pure graph benchmark with bounded size; assert node/edge counts, do not allocate 300 Docker modules. |
| GRF21 | Source local node references fellow mesh root through extends, then that root references original root by requirement. | Legal merged graph, origin-specific targets retained. | Multi-source cycle fixture; compare expected four-node closure and zero spurious ordering cycle. |
| GRF22 | Generate 40 graphs with fixed seed and ≤8 nodes, mixed requisite kinds. | Reachability and ordering-cycle decisions match independent oracle. | Test-only exhaustive path exploration/transitive matrix, not imported production helpers; exclude main prerequisite policy cases or expect explicit failure. |

## D. Reference grammar, permissions and deferred evaluation

Owner: `tests/v3/references.test.ts`. Spec §§19–20, 40–46, 49–50, 79, 82, 87–90, 101. I cases use EP and actual public compilation.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| REF01 | main env references own published HTTP endpoint; no self requisite. | Self reference permitted and correct URL. | COMPILE B0 prod with env; assert no self ordering edge added. |
| REF02 | main references db endpoint with direct dependency/requirement/prerequisite edge. | Visibility follows every edge kind, not just dependency. | Parameterize kind with appropriate target lifecycle fixture; assert interpolated host/port. |
| REF03 | main→migration→db; main references db, without direct main→db. | Transitive closure permits reference. | Remove direct edge; ensure main env resolves db and no inferred direct edge appears. |
| REF04 | main references declared dormant db without edge. | Outside-closure failure; db not pulled in. | FAIL points to winning env key and target; no Compose load for db triggered by ref. |
| REF05 | Mesh root a references active unrelated root b without requisite. | Invalid despite b being globally materialized. | MM remove frontend→backend edge but retain env; FAIL closure. |
| REF06 | Prune inherited local backend edge but keep its env ref. | Surviving reference rejected. | Mesh extends false only; assert removed edge origin when available. |
| REF07 | Same prune but mesh env replaces lower value with valid new-root ref or literal. | Succeeds; stale lower ref never parsed/resolved. | Spy resolver input expressions; expect only final winning value. |
| REF08 | Invalid source base reference shadowed by source stage, selected override or mesh layer. | Each shadowing boundary suppresses stale validation. | EP parameter family; remove higher winner in control and expect original error. |
| REF09 | Lower invalid reference on A shadowed only for B. | A still fails; per-key selection not whole-layer suppression. | Two env keys with distinct errors; assert A path. |
| REF10 | Mesh expression backend.source.mail.endpoints.http.public_url. | Nested local node resolves only with consumer closure and published endpoint. | Three variants: valid, missing requisite, missing publication; assert distinct outcomes. |
| REF11 | Mesh extends source.db reference versus source-authored db reference. | Both target current source db, not mesh root db. | Same-named mesh root with different port makes incorrect scope observable. |
| REF12 | Use legacy app/dependencies syntax at invalid scope, omit endpoints, extra segments, unknown property or unmatched expression. | Malformed Builder expression rejected; legitimate local service named app remains valid canonical syntax. | Parser table plus integration with encoded env strings. |
| REF13 | Evaluate all eight properties on networkHost `svc-db`, port 5432, publicHost 127.0.0.1, publicPort 15432, scheme postgres. | Exact host/port/address/URL strings; numeric values stringified. | Independent expected literal table, not production property helper as oracle. |
| REF14 | Omit scheme; request network_url/public_url then host/port/address. | URLs fail; non-URL properties remain valid if public capability exists. | Property parameter family with specific scheme error. |
| REF15 | Public property for private mesh endpoint or standalone endpoint with no publicPort. | All four public properties rejected; network properties allowed with closure. | Property family; no placeholder public host fabricated. |
| REF16 | Unknown service or endpoint with otherwise valid requisite graph. | Correct unknown-target/endpoint diagnostics, no undefined/string empty output. | Parser resolution tests and public compile. |
| REF17 | Multiple refs in string `postgres://u@${db...network_address}/x?peer=${main...network_port}`. | Both replaced, literals preserved, no extra edges. | Compare exact output and graph before/after. |
| REF18 | `$${literal}`, plain dollars, adjacent refs, braces, unicode and newline literals. | Documented literal escaping preserved through serialized YAML; Builder expressions resolved once. | Roundtrip parse generated YAML; assert exact logical env with one serialization unescape boundary. |
| REF19 | Tester references every active graph node, including requirement-only mail/job subtree; then dormant unused. | Active visibility allowed without explicit tester requisites; dormant rejected. | E2E compiler with tester env; assert no tester root edge list in raw config. |
| REF20 | Tester uses network properties instead of recommended public properties. | Grammar accepted when target reachable; no public-only restriction. | Compile explicit bridge and host tester variants; don't claim connectivity from compilation. |
| REF21 | Invalid tester env refs in ordinary dev/prod compilation, then E2E. | Inactive tester refs ignored under D05; E2E rejects. | Stage pair; tester schema is still structurally valid in both. |
| REF22 | Isolated main retains external ref versus isolated stage replacing it with literal. | D06 rejects retained ref; replacement succeeds with main only. | Two independent tests with explicit policy decision tag; document spec-example tension. |
| REF23 | Public AUTO ref before allocation; invalid surviving ref exists elsewhere. | Invalid config fails before probing/writing port allocations. | I with port adapter throwing if called; expect reference error instead. |
| REF24 | Env error contains secret prefix and malformed endpoint reference. | Error shows path/reference but not secret env payload. | Capture exception/logs/debug output; sentinel credential string absent. |

## E. Required cross-feature golden scenarios

Owner: `tests/conformance/v3-composition.test.ts`. Each uses real compiler/file loaders; zero Docker.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| INT01 | BG E2E adds fixture-loader prerequisite, deletes mail edge, inherits prod main env. | Exact node set main/db/migration/fixture-loader; both jobs completion-gated; tester uses prod main and E2E env. | Assert node/env/conditions/publication together, not separate snapshots. |
| INT02 | Spec exhaustive build example with generated module assets; compile full dev/prod/E2E. | Graphs match §85, observability pruned in E2E, fixture added, tester barrier correct. | Copy canonical JSON unchanged; supply assets only; separately record isolated D06 failure. |
| INT03 | Spec exhaustive mesh example with generated sources including inspector/audit-sink. | Requirement cycles legal, local mocks pruned, publish replaced, stage roots exact. | Compare full expected canonical node/edge/publication sets per stage from §86. |
| INT04 | Spec invalid examples §§87–94 encoded as minimal independent fixtures. | Each rejects for its own normative reason before runtime. | Parameter family with section ID and expected path; use valid surrounding schema/tester metadata. |
| INT05 | End-to-end compile/public API with same inputs rendered twice in different key order. | Stable semantic output; no stale state or accidental input mutation. | Parse both YAML strings, compare canonical maps and origin-independent names; allow only documented formatting differences. |
| INT06 | Force invalid final endpoint/graph/env while all lower layers valid. | Compiler cannot bypass final semantic validation merely because raw schemas passed. | One mutation per final layer; port/cache/startup adapters assert no calls. |
