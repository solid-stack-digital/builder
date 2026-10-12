# Mesh Publication and Host-Port Allocation

> Builder V2 conformance test conditions. These scenarios are derived from the final V2 specification and are intended to serve as acceptance criteria for an implementation that does not yet exist.

## Scope

Host-private mesh defaults, publish grammar and eligibility, local-dependency versus substituted-provider publication, fixed-port conflicts, AUTO allocation/cache semantics, deterministic allocation order, and public endpoint property availability.

## Test execution convention

Use the lowest test layer that can prove the invariant:

- **schema/config unit test** for JSON shape, field type, identifier, and unsupported-field validation;
- **compiler unit/integration test** for overlays, references, substitution, publication, namespacing, lifecycle graphs, port allocation, and generated Compose;
- **Docker/Compose integration test** for real health transitions, DNS reachability, environment propagation, host publication, and resource behavior;
- **CLI/E2E test** for command sequencing, exit-code propagation, cleanup, and black-box tester semantics.

A scenario passes only when both its positive behavior and its stated non-effects are verified.

## Scenario count

**30 scenarios**

## PUB-001 — Mesh is host-private by default

**Normative basis:** build publicPort is eligibility; mesh publish is actual exposure.

### Situation / fixture

Service app endpoint declares publicPort and scheme, but mesh service has no publish entry.

### Trigger

Compile mesh.

### Expected result

Endpoint remains network-reachable inside mesh but is not host-published.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Service app endpoint declares publicPort and scheme, but mesh service has no publish entry.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No host mapping.
- network_* resolves.
- public_* reference fails.
- No host port is reserved/allocated for this endpoint.

## PUB-002 — Mesh fixed app endpoint publication

**Normative basis:** Published eligible app endpoint becomes effective.

### Situation / fixture

App endpoint http has publicPort 31001; mesh publish contains app.endpoints.http.

### Trigger

Compile mesh.

### Expected result

Builder publishes exactly host 31001 to the app endpoint port.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. App endpoint http has publicPort 31001; mesh publish contains app.endpoints.http.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- public_host=127.0.0.1.
- public_port=31001.
- Mapping is on correct app service.

## PUB-003 — Mesh AUTO app publication

**Normative basis:** AUTO allocation occurs only for effective publication.

### Situation / fixture

App endpoint http has publicPort AUTO; mesh publishes it.

### Trigger

Compile mesh.

### Expected result

Builder allocates a concrete stable available host port.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. App endpoint http has publicPort AUTO; mesh publishes it.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- public_port numeric.
- public_url uses scheme and 127.0.0.1.
- Allocation is cached by logical endpoint.

## PUB-004 — Mesh local dependency publication

**Normative basis:** Local materialized dependency endpoints may be published.

### Situation / fixture

Consumer local dependency has endpoint ui with publicPort AUTO; mesh publish selects dependencies.firebase.endpoints.ui.

### Trigger

Compile mesh without substituting firebase.

### Expected result

Dependency bundle materializes and endpoint owner is host-published.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer local dependency has endpoint ui with publicPort AUTO; mesh publish selects dependencies.firebase.endpoints.ui.
3. Compile mesh without substituting firebase.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Mapping targets dependency endpoint owner.
- public_* resolves via consumer effective dependency slot.

## PUB-005 — Publish endpoint without publicPort fails

**Normative basis:** Publish requires endpoint publicPort capability.

### Situation / fixture

App endpoint exists but publicPort is omitted; mesh publish selects it.

### Trigger

Compile mesh.

### Expected result

Builder fails because publish cannot invent publication intent/host port.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. App endpoint exists but publicPort is omitted; mesh publish selects it.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error names publish target.
- No AUTO fallback is assumed.

## PUB-006 — Publish unknown app endpoint fails

**Normative basis:** Publish targets must exist effectively.

### Situation / fixture

Mesh publish contains app.endpoints.admin but effective build app exposes only http.

### Trigger

Compile mesh.

### Expected result

Builder fails after effective stage resolution.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh publish contains app.endpoints.admin but effective build app exposes only http.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic points to service publish path and missing endpoint.
- No fuzzy/primary substitution.

## PUB-007 — Publish unknown dependency endpoint fails

**Normative basis:** Dependency publish target must be a declared effective endpoint.

### Situation / fixture

Mesh publish selects dependencies.redis.endpoints.ui, but redis only exposes redis endpoint.

### Trigger

Compile mesh.

### Expected result

Builder fails unresolved publish target.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh publish selects dependencies.redis.endpoints.ui, but redis only exposes redis endpoint.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error names dependency/endpoint.
- No Compose service inference occurs.

## PUB-008 — Malformed publish grammar fails

**Normative basis:** Mesh publish grammar is deliberately narrow.

### Situation / fixture

Use publish strings such as `http`, `services.app.http`, `dependencies.redis.http`, or an endpoint property path.

### Trigger

Validate each parameterized fixture.

### Expected result

Only `app.endpoints.<name>` and `dependencies.<dep>.endpoints.<name>` forms are accepted.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Use publish strings such as `http`, `services.app.http`, `dependencies.redis.http`, or an endpoint property path.
3. Validate each parameterized fixture.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Each malformed variant fails schema/semantic validation.
- Diagnostics retain offending string.

## PUB-009 — Substituted dependency cannot be published through consumer

**Normative basis:** Suppressed dependency endpoints are not consumer-owned publication targets.

### Situation / fixture

Consumer binds payments slot to provider and still publishes dependencies.payments.endpoints.http.

### Trigger

Compile mesh.

### Expected result

Builder fails because that local dependency implementation is suppressed.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer binds payments slot to provider and still publishes dependencies.payments.endpoints.http.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No local port mapping.
- Diagnostic explains provider endpoint must be published at provider service.

## PUB-010 — Publishing provider app is the correct substituted path

**Normative basis:** Provider owns publication after substitution.

### Situation / fixture

Provider app http has publicPort AUTO; provider mesh service publishes app.endpoints.http; consumer binds logical slot to provider.

### Trigger

Compile mesh.

### Expected result

Provider endpoint is effectively public and logical consumer public references can resolve through it.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Provider app http has publicPort AUTO; provider mesh service publishes app.endpoints.http; consumer binds logical slot to provider.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- One host mapping on provider.
- No duplicate mapping through consumer.

## PUB-011 — Stage publish union-merges with base

**Normative basis:** Mesh publish is an explicit union-merge array exception.

### Situation / fixture

Base publishes http; e2e stage publishes metrics; both endpoints have publicPort.

### Trigger

Compile base prod and e2e.

### Expected result

E2E publishes both http then metrics, exact duplicates deduplicated.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base publishes http; e2e stage publishes metrics; both endpoints have publicPort.
3. Compile base prod and e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Base only has http effective publication.
- E2E has both.
- Array order follows base then stage.

## PUB-012 — Inactive stage publication does not reserve ports

**Normative basis:** Validation/allocation is active-stage specific.

### Situation / fixture

E2E stage publishes fixed port 32001; dev does not publish that endpoint.

### Trigger

Compile dev while another dev endpoint also uses 32001.

### Expected result

No conflict arises from inactive E2E publication.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. E2E stage publishes fixed port 32001; dev does not publish that endpoint.
3. Compile dev while another dev endpoint also uses 32001.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Only active effective published endpoints participate in reservation.

## PUB-013 — Fixed app-app collision fails globally

**Normative basis:** Mesh has one global host-port namespace.

### Situation / fixture

Two mesh app endpoints are both published with fixed publicPort 33000.

### Trigger

Compile mesh.

### Expected result

Builder raises a PortConflictError-class failure.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Two mesh app endpoints are both published with fixed publicPort 33000.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Both logical endpoint paths are reported.
- Neither is silently remapped.
- No runtime starts.

## PUB-014 — Fixed app-local-dependency collision fails

**Normative basis:** Global namespace includes every effectively published endpoint.

### Situation / fixture

Published gateway app endpoint and published backend local dependency endpoint both request 33001.

### Trigger

Compile mesh.

### Expected result

Builder rejects collision across endpoint ownership types.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Published gateway app endpoint and published backend local dependency endpoint both request 33001.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error names app path and dependency endpoint path.

## PUB-015 — Fixed local-dependency endpoints across consumers collide

**Normative basis:** Host namespace is global even when Docker resource namespace is isolated.

### Situation / fixture

Service A local db UI and service B local cache UI both publish fixed 33002.

### Trigger

Compile mesh.

### Expected result

Builder detects conflict even though dependency bundles are otherwise namespaced.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Service A local db UI and service B local cache UI both publish fixed 33002.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Namespacing does not hide host-port collision.
- Both consumer-scoped logical paths are shown.

## PUB-016 — Same fixed intent is valid when only one endpoint is published

**Normative basis:** Eligibility without publication does not reserve a mesh host port.

### Situation / fixture

Two app build endpoints each declare publicPort 33003; mesh publish includes only one.

### Trigger

Compile mesh.

### Expected result

Compilation succeeds because non-published endpoint does not reserve the host port.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Two app build endpoints each declare publicPort 33003; mesh publish includes only one.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Exactly one mapping at 33003.
- Unpublished endpoint has no public_* properties.

## PUB-017 — Independent standalone services may reuse fixed declaration

**Normative basis:** Mesh-global namespace is distinct from unrelated standalone projects.

### Situation / fixture

Two standalone projects each declare 8080 but are compiled independently, then a mesh fixture composes both and publishes both.

### Trigger

Run independent compile then mesh compile.

### Expected result

Standalone configs are individually valid; mesh compile fails global collision.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Two standalone projects each declare 8080 but are compiled independently, then a mesh fixture composes both and publishes both.
3. Run independent compile then mesh compile.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No schema-level global ban on 8080.
- Conflict is composition/effective-publication dependent.

## PUB-018 — All fixed ports reserve before any AUTO allocation

**Normative basis:** Fixed reservation precedes AUTO allocation.

### Situation / fixture

Published fixed endpoint uses a port likely in allocator scan range; another published endpoint is AUTO.

### Trigger

Compile from clean .builder cache.

### Expected result

AUTO allocator must skip every fixed reservation regardless of service processing order.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Published fixed endpoint uses a port likely in allocator scan range; another published endpoint is AUTO.
3. Compile from clean .builder cache.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- AUTO result is never equal to fixed reserved port.
- Reordering JSON does not change this rule.

## PUB-019 — AUTO cache is stable while cached port remains available

**Normative basis:** AUTO is stable opportunistically.

### Situation / fixture

Compile one logical published AUTO endpoint from clean cache; save allocated port; tear down runtime while leaving cache.

### Trigger

Compile same logical mesh again.

### Expected result

Builder prefers and reuses the cached available port.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Compile one logical published AUTO endpoint from clean cache; save allocated port; tear down runtime while leaving cache.
3. Compile same logical mesh again.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Same logical endpoint gets same port.
- Cache location remains under .builder.

## PUB-020 — Unavailable cached AUTO port is replaced deterministically

**Normative basis:** Cached AUTO values are reused only if available.

### Situation / fixture

First allocate AUTO; then bind that cached host port with an external fixture process before recompilation.

### Trigger

Compile same mesh.

### Expected result

Builder detects port unavailable/reserved and deterministically chooses another available port, then updates cache.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. First allocate AUTO; then bind that cached host port with an external fixture process before recompilation.
3. Compile same mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- New port differs from blocked port.
- Compilation succeeds if alternatives exist.
- Subsequent compile can reuse new port.

## PUB-021 — Deleting .builder cache does not invalidate configuration

**Normative basis:** AUTO cache is disposable.

### Situation / fixture

Compile mesh with multiple AUTO publications; delete only the gitignored .builder allocation state.

### Trigger

Compile again.

### Expected result

Configuration remains valid; ports may change.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Compile mesh with multiple AUTO publications; delete only the gitignored .builder allocation state.
3. Compile again.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No missing-cache error.
- All published endpoints receive concrete available ports again.

## PUB-022 — AUTO allocation sorts mesh services alphabetically

**Normative basis:** Mesh allocation ordering is deterministic.

### Situation / fixture

Define published AUTO endpoints on services zeta, alpha, middle in intentionally shuffled JSON insertion order.

### Trigger

Compile from clean allocator state, then rewrite JSON in another order without changing logical graph and compile from equivalent clean state.

### Expected result

Allocation sequence follows alphabetical service names, not source order.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Define published AUTO endpoints on services zeta, alpha, middle in intentionally shuffled JSON insertion order.
3. Compile from clean allocator state, then rewrite JSON in another order without changing logical graph and compile from equivalent clean state.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Alpha is processed before middle before zeta for AUTO allocation.
- Equivalent logical configs produce same allocation ordering under same availability.

## PUB-023 — Within one service app endpoints allocate before dependency endpoints

**Normative basis:** Deterministic allocation order distinguishes app before dependencies.

### Situation / fixture

Service has multiple published AUTO app endpoints and local dependency AUTO endpoints.

### Trigger

Compile from clean deterministic allocator conditions.

### Expected result

Builder processes app endpoint publications before dependency publications for that service.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Service has multiple published AUTO app endpoints and local dependency AUTO endpoints.
3. Compile from clean deterministic allocator conditions.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Observed allocation sequence reflects app-first rule.

## PUB-024 — Dependencies allocate alphabetically within service

**Normative basis:** Dependency AUTO order is alphabetical.

### Situation / fixture

Consumer has published AUTO endpoints in dependencies z-cache, a-db, m-mail, declared in shuffled JSON order.

### Trigger

Compile from clean allocator state.

### Expected result

Dependency groups are processed a-db, m-mail, z-cache.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer has published AUTO endpoints in dependencies z-cache, a-db, m-mail, declared in shuffled JSON order.
3. Compile from clean allocator state.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Allocation sequence follows dependency key sort.

## PUB-025 — Endpoints allocate alphabetically within dependency

**Normative basis:** Endpoint AUTO order within dependencies is alphabetical.

### Situation / fixture

One dependency has published AUTO endpoints z-ui, a-admin, m-metrics in shuffled declaration order.

### Trigger

Compile from clean state.

### Expected result

AUTO allocation processes a-admin, m-metrics, z-ui.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. One dependency has published AUTO endpoints z-ui, a-admin, m-metrics in shuffled declaration order.
3. Compile from clean state.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Allocation sequence independent of JSON object insertion order.

## PUB-026 — Unpublished AUTO endpoint does not allocate

**Normative basis:** Non-published mesh endpoints do not allocate/reserve ports.

### Situation / fixture

Endpoint declares publicPort AUTO but mesh publish omits it.

### Trigger

Compile and inspect generated Compose plus allocation cache where observable.

### Expected result

No effective host port exists for this endpoint.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Endpoint declares publicPort AUTO but mesh publish omits it.
3. Compile and inspect generated Compose plus allocation cache where observable.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No mapping.
- No public_port/public_url.
- It must not consume a host port that can create a collision.

## PUB-027 — public_* reference becomes legal only after publication resolution

**Normative basis:** Reference resolution follows publication and allocation.

### Situation / fixture

Mesh service env references its own/another service endpoint public_url; endpoint has publicPort and publish selects it.

### Trigger

Compile mesh.

### Expected result

Builder determines publication/port allocation before resolving public_url and injects concrete URL.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh service env references its own/another service endpoint public_url; endpoint has publicPort and publish selects it.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No unresolved AUTO token remains.
- URL uses final effective port.

## PUB-028 — public_host is exactly loopback address

**Normative basis:** V2 public host semantics are loopback.

### Situation / fixture

Publish any eligible endpoint and reference public_host/public_address.

### Trigger

Compile mesh.

### Expected result

Current V2 public_host resolves to `127.0.0.1`.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Publish any eligible endpoint and reference public_host/public_address.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- public_address begins `127.0.0.1:`.
- No Docker DNS host is used for public properties.

## PUB-029 — Stage can add publicPort capability in build and publish in matching mesh stage

**Normative basis:** Publication validates against effective active-stage endpoint.

### Situation / fixture

Base app endpoint has no publicPort; service build e2e overlay adds publicPort AUTO; mesh e2e overlay adds publish entry.

### Trigger

Compile prod and e2e.

### Expected result

Prod stays private; E2E has valid effective publication.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base app endpoint has no publicPort; service build e2e overlay adds publicPort AUTO; mesh e2e overlay adds publish entry.
3. Compile prod and e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Prod no allocation.
- E2E concrete public port.
- Stage merge happens before publish validation.

## PUB-030 — Port conflict diagnostic identifies both logical endpoints

**Normative basis:** Fixed collisions are fail-fast configuration failures.

### Situation / fixture

Create a collision using long/nested paths, e.g. gateway app endpoint and orders.dependencies.firebase.endpoints.ui.

### Trigger

Compile mesh.

### Expected result

Failure is actionable, not just OS bind error.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create a collision using long/nested paths, e.g. gateway app endpoint and orders.dependencies.firebase.endpoints.ui.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Both logical paths and conflicting fixed port appear in diagnostic.
- Error occurs at compile/configuration time before Docker runtime.
