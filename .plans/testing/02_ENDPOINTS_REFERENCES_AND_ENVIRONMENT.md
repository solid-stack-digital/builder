# 02 — Endpoint Semantics, Builder References, Provider Compatibility, and Environment Ownership

> Builder V2 conformance test conditions. These scenarios are derived from the final V2 specification and are intended to serve as acceptance criteria for an implementation that does not yet exist.

## Scope

Covers all endpoint properties, URL/scheme and public/private addressability, interpolation grammar, stage-aware resolution, substituted-provider compatibility, environment ownership, Builder-owned keys, and the deliberate separation of environment wiring from lifecycle ordering.

## Test execution convention

Use the lowest test layer that can prove the invariant:

- **schema/config unit test** for JSON shape, field type, identifier, and unsupported-field validation;
- **compiler unit/integration test** for overlays, references, substitution, publication, namespacing, lifecycle graphs, port allocation, and generated Compose;
- **Docker/Compose integration test** for real health transitions, DNS reachability, environment propagation, host publication, and resource behavior;
- **CLI/E2E test** for command sequencing, exit-code propagation, cleanup, and black-box tester semantics.

A scenario passes only when both its positive behavior and its stated non-effects are verified.

## Scenario count

**39 scenarios**

## REF-001 — App network_host reference

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

App has primary `http` endpoint at port 3000. App env references `${app.endpoints.http.network_host}`.

### Trigger

Compile standalone.

### Expected result

Reference resolves to the internal Docker-reachable app host.

### How to test

Inspect generated app env and, in an integration fixture, resolve that host from the composition network.

### Required assertions

- Value is not the host-public address.
- Reference does not create any lifecycle edge.

## REF-002 — App network_port reference

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

App `http.port=3000`; env uses `network_port`.

### Trigger

Compile.

### Expected result

The resolved environment value represents endpoint network port 3000.

### How to test

Inspect normalized reference result and runtime env.

### Required assertions

- No host publication is implied.

## REF-003 — App network_address reference

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

App endpoint has port 3000.

### Trigger

Resolve `network_address`.

### Expected result

Result is `<internal-host>:3000` with no scheme.

### How to test

Compare host component to app internal DNS and suffix to port.

### Required assertions

- No public host is substituted.

## REF-004 — network_url requires scheme

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Create two equivalent app endpoints, one with scheme `http`, one without.

### Trigger

Request `network_url`.

### Expected result

Scheme-bearing endpoint resolves to `http://<host>:<port>`; scheme-less URL reference fails.

### How to test

Compile both fixtures.

### Required assertions

- Scheme-less endpoint still supports host/port/address properties.

## REF-005 — Standalone public_host

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

App endpoint is effectively published using fixed publicPort.

### Trigger

Resolve `public_host`.

### Expected result

Result is `127.0.0.1`.

### How to test

Inspect reference result and real host binding.

### Required assertions

- Exists only when endpoint is effectively published.

## REF-006 — Standalone fixed public properties

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

App endpoint `port=3000`, `publicPort=18080`, `scheme=http`.

### Trigger

Compile/run standalone.

### Expected result

`public_port=18080`, `public_address=127.0.0.1:18080`, `public_url=http://127.0.0.1:18080`.

### How to test

Inspect generated ports and probe host.

### Required assertions

- Container/network port remains 3000.

## REF-007 — Standalone AUTO public references

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

App endpoint uses `publicPort:"AUTO"`.

### Trigger

Compile twice with cache intact.

### Expected result

Builder allocates concrete port before final interpolation; public references contain the actual port and remain stable while available.

### How to test

Inspect allocation, env, and host reachability.

### Required assertions

- Literal `AUTO` never reaches runtime env.

## REF-008 — public_* reference on unpublished endpoint

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Endpoint omits publicPort or, in mesh, is not selected by publish.

### Trigger

Request each public property.

### Expected result

Compilation fails because the property is unavailable.

### How to test

Parameterize public_host/public_port/public_address/public_url.

### Required assertions

- Error identifies endpoint and property.

## REF-009 — Dependency host resolves to explicit owner

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Dependency Compose has `api` and `helper`; logical endpoint points to service `api`.

### Trigger

Resolve dependency `network_host`.

### Expected result

Result points to namespaced/reachable api owner, not dependency key or helper.

### How to test

Inspect compiled ownership and perform in-network DNS/probe.

### Required assertions

- Generated concrete name is private implementation detail.

## REF-010 — Multiple endpoints same owner

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Two dependency endpoints share service `api` but use distinct ports.

### Trigger

Resolve network hosts and ports.

### Expected result

Hosts are same owner identity; ports remain per endpoint.

### How to test

Inspect resolved values.

### Required assertions

- Builder does not duplicate service per endpoint.

## REF-011 — Multiple endpoints different owners

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Dependency endpoints map to services `api` and `metrics`.

### Trigger

Resolve network properties.

### Expected result

Each endpoint points to its own explicit owner and port.

### How to test

Probe both from app network.

### Required assertions

- Primary endpoint does not redirect non-primary endpoint.

## REF-012 — Dependency URL scheme requirement

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Dependency endpoint lacks scheme.

### Trigger

Request `network_url`.

### Expected result

Fail; host/port/address still work.

### How to test

Compile URL negative and address positive controls.

### Required assertions

- No scheme inferred from port or service image.

## REF-013 — Reference inside larger string

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Set env to `${dependencies.backend.endpoints.http.network_url}/v1/resources?x=1`.

### Trigger

Compile.

### Expected result

Token is replaced and literal suffix preserved exactly.

### How to test

Inspect final value.

### Required assertions

- No over-greedy substitution.

## REF-014 — Multiple references in one value

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

One env value contains two valid Builder tokens separated by literal text.

### Trigger

Compile.

### Expected result

Both resolve in final effective composition.

### How to test

Assert exact final string.

### Required assertions

- Any unresolved token makes declaration fail; no partially unresolved output.

## REF-015 — Unsupported endpoint property

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Use `hostname`, `url`, `host`, or another non-specified endpoint property.

### Trigger

Compile.

### Expected result

Fail; only eight documented properties are exposed.

### How to test

Parameterize near-miss names.

### Required assertions

- No aliases silently accepted.

## REF-016 — Unknown app endpoint

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Reference `${app.endpoints.missing.network_host}`.

### Trigger

Compile active stage.

### Expected result

Fail unresolved reference.

### How to test

Add existing endpoint positive control.

### Required assertions

- No fallback to primary endpoint.

## REF-017 — Unknown dependency or endpoint

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Reference missing dependency and, separately, missing endpoint on existing dependency.

### Trigger

Compile.

### Expected result

Fail with exact missing logical object.

### How to test

Capture errors.

### Required assertions

- Builder does not treat token as ordinary shell variable.

## REF-018 — Literal dollar escaping

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Use documented `$$` literal-dollar form so runtime should receive a literal `${SHELL_VAR}`-style string.

### Trigger

Compile/run.

### Expected result

Builder preserves intended literal dollar expression rather than resolving it as Builder reference.

### How to test

Inspect generated Compose and runtime echo.

### Required assertions

- Unescaped Builder-shaped token remains subject to reference validation.

## REF-019 — Mesh direct app reference

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Gateway env uses `${backend.app.endpoints.http.network_url}`.

### Trigger

Compile mesh.

### Expected result

Resolves directly to backend app endpoint.

### How to test

Inspect gateway env and connectivity.

### Required assertions

- No `services.` prefix.

## REF-020 — services. mesh prefix rejected

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Use `${services.backend.app.endpoints.http.network_url}`.

### Trigger

Compile.

### Expected result

Fail; V2 reference grammar has no `services.` prefix.

### How to test

Capture error.

### Required assertions

- Prefix is not silently stripped.

## REF-021 — Mesh effective local dependency-slot reference

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Mesh env references `${frontend.dependencies.backend.endpoints.http.network_url}` while slot remains local.

### Trigger

Compile integrated mesh.

### Expected result

Resolves to frontend's local dependency endpoint.

### How to test

Inspect resolved env/topology.

### Required assertions

- Uses effective slot after stage overlay.

## REF-022 — Effective slot reference after substitution

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Bind frontend backend slot to top-level provider.

### Trigger

Compile.

### Expected result

Same logical slot reference resolves provider app endpoint and local bundle is absent.

### How to test

Inspect env and topology.

### Required assertions

- Provider's port/scheme are authoritative.

## REF-023 — Provider host property needs endpoint only

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Substituted provider matching endpoint has no scheme; consumer uses `network_host`.

### Trigger

Compile.

### Expected result

Pass.

### How to test

Inspect resolved host.

### Required assertions

- No unnecessary scheme check.

## REF-024 — Provider URL needs provider scheme

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Consumer uses `network_url`; provider matching endpoint lacks scheme.

### Trigger

Compile.

### Expected result

Fail property-specific compatibility.

### How to test

Add provider scheme and pass.

### Required assertions

- Local dependency's scheme cannot fill provider's missing scheme.

## REF-025 — Provider public property needs effective provider publication

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Provider endpoint has publicPort capability but provider mesh service does not publish it; consumer/tester requests effective slot public_port.

### Trigger

Compile.

### Expected result

Fail until provider's app endpoint is explicitly published.

### How to test

Compile before/after provider publish.

### Required assertions

- Consumer local publicPort capability is irrelevant after substitution.

## REF-026 — Provider endpoint names are exact

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Logical endpoint is `http`; provider offers only `api` with same port/scheme.

### Trigger

Compile when `http` is consumed.

### Expected result

Fail; Builder does not guess mappings.

### How to test

Add exact `http` endpoint to provider and recompile.

### Required assertions

- Equivalent endpoint shapes do not satisfy name mismatch.

## REF-027 — Provider port may differ

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Local default http port=3000; provider http port=8080.

### Trigger

Compile substituted composition.

### Expected result

Pass; `network_port` and URL use 8080.

### How to test

Inspect consumer env.

### Required assertions

- No endpoint-object equality requirement.

## REF-028 — Unused provider compatibility surface ignored

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Local dependency has http+metrics; consumer only references http; provider only exposes http.

### Trigger

Compile.

### Expected result

Pass because compatibility is reference-driven.

### How to test

Then add a metrics reference and expect failure.

### Required assertions

- Extra/missing unused endpoints do not matter.

## REF-029 — Environment reference creates no lifecycle edge

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Mesh service A env references B network_url but has no dependsOn/substitution relation.

### Trigger

Compile.

### Expected result

Reference resolves but no A->B `depends_on` appears.

### How to test

Inspect generated lifecycle graph.

### Required assertions

- Environment wiring and ordering are independent.

## REF-030 — dependsOn creates no environment value

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Declare lifecycle relation with no env references.

### Trigger

Compile.

### Expected result

Lifecycle edge exists, but Builder synthesizes no URL/host env variable.

### How to test

Inspect env and graph.

### Required assertions

- Only explicit env plus Builder-owned internals appear.

## REF-031 — Dependency env applies module-wide

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Multi-service dependency receives `dependencies.x.env.PROJECT_ID`.

### Trigger

Compile integrated.

### Expected result

Every service in atomic dependency bundle receives overlay.

### How to test

Inspect each generated dependency service environment.

### Required assertions

- App does not automatically receive dependency env.

## REF-032 — Mesh service env applies app only

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Mesh service with local dependency receives `FEATURE=x` in service env.

### Trigger

Compile.

### Expected result

App gets FEATURE; local dependency services do not.

### How to test

Inspect all containers' env.

### Required assertions

- Dependency configuration stays in build.json dependency env/Compose.

## REF-033 — Builder-owned PORT conflict

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Primary endpoint establishes Builder PORT while a user env layer also defines PORT.

### Trigger

Compile.

### Expected result

Fail ownership conflict rather than last-wins override.

### How to test

Parameterize base/stage app env, override Compose env, mesh base/stage env.

### Required assertions

- Error identifies Builder-owned key.

## REF-034 — Builder-owned EXEC_MODE and INFRA_MODE conflict

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

User layer sets EXEC_MODE or INFRA_MODE.

### Trigger

Compile relevant standalone/mesh execution.

### Expected result

Fail ownership conflict.

### How to test

Parameterize layers/stages.

### Required assertions

- No silent user override and no silent Builder overwrite.

## REF-035 — Runtime env does not become Docker build args

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

JSON env sets FOO but Dockerfile ARG FOO has distinguishable default.

### Trigger

Build/run without explicit override build args.

### Expected result

Runtime receives JSON env; build ARG remains default.

### How to test

Inspect image build marker and runtime env.

### Required assertions

- Explicit override-compose build.args is the positive build-time mechanism.

## REF-036 — Stage-only app endpoint reference placement

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

E2E adds debug endpoint and only e2e app env references it.

### Trigger

Compile e2e and dev.

### Expected result

E2E resolves; dev unaffected.

### How to test

Move reference to base app env as negative control.

### Required assertions

- Base reference then fails in stages where endpoint does not exist.

## REF-037 — Stage-only dependency reference placement

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

E2E adds Mailpit and e2e app env references it.

### Trigger

Compile e2e and prod.

### Expected result

E2E resolves; prod does not see Mailpit.

### How to test

Move reference to base as negative control.

### Required assertions

- No cross-stage leakage.

## REF-038 — Resolution order includes substitution, publication, fixed reservation, AUTO allocation

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Substituted provider has published AUTO endpoint used in final env/tester reference.

### Trigger

Compile mesh E2E.

### Expected result

Builder resolves against provider, determines publication, reserves fixed ports, allocates AUTO, then produces concrete reference value.

### How to test

Inspect intermediate normalized model if exposed plus generated env.

### Required assertions

- No local slot value or literal AUTO survives.

## REF-039 — public_url requires publication and scheme

**Normative basis:** SPECS_V2 §§5–8, 22; BUILD_JSON_DOCS §§3–6, 11

### Situation / fixture

Endpoint is effectively published but lacks scheme.

### Trigger

Request public_url.

### Expected result

Fail missing scheme; public_address succeeds.

### How to test

Compile both references.

### Required assertions

- Diagnostic distinguishes scheme from publication failure.
