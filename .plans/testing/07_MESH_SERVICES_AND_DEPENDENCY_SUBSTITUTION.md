# Mesh Services and Logical Dependency Substitution

> Builder V2 conformance test conditions. These scenarios are derived from the final V2 specification and are intended to serve as acceptance criteria for an implementation that does not yet exist.

## Scope

Mesh service identity/path/env, direct cross-service references, logical dependency bindings, provider validation and property-specific compatibility, stage-dependent providers, atomic suppression, lifecycle transfer, and preservation of unbound service-local infrastructure.

## Test execution convention

Use the lowest test layer that can prove the invariant:

- **schema/config unit test** for JSON shape, field type, identifier, and unsupported-field validation;
- **compiler unit/integration test** for overlays, references, substitution, publication, namespacing, lifecycle graphs, port allocation, and generated Compose;
- **Docker/Compose integration test** for real health transitions, DNS reachability, environment propagation, host publication, and resource behavior;
- **CLI/E2E test** for command sequencing, exit-code propagation, cleanup, and black-box tester semantics.

A scenario passes only when both its positive behavior and its stated non-effects are verified.

## Scenario count

**40 scenarios**

## MSH-001 — Single independently runnable service composes in mesh

**Normative basis:** mesh.json composes independently runnable services.

### Situation / fixture

Create mesh.json with one valid service path whose directory has its own V2 build.json/Dockerfile.

### Trigger

Compile mesh dev and prod.

### Expected result

The service is composed under the mesh service key without losing its service-owned endpoint/dependency configuration.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create mesh.json with one valid service path whose directory has its own V2 build.json/Dockerfile.
3. Compile mesh dev and prod.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Service build.json is loaded.
- Mesh service key is the mesh identity.
- Unsubstituted local dependencies follow integrated mesh semantics.

## MSH-002 — Mesh key overrides build.json name for mesh identity

**Normative basis:** Mesh service key is authoritative in mesh mode.

### Situation / fixture

Service directory build.json has `name:"users-api"` while mesh key is `identity`.

### Trigger

Compile mesh.

### Expected result

Cross-service references and generated logical diagnostics use `identity`; build.json name does not rename the mesh node.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Service directory build.json has `name:"users-api"` while mesh key is `identity`.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- `${identity.app...}` resolves.
- `${users-api.app...}` is unresolved unless a separate mesh key exists.

## MSH-003 — Mesh service env configures app only

**Normative basis:** Mesh service env is consumer app configuration.

### Situation / fixture

Mesh service env sets `REGION=mesh`; service also has a local dependency with its own env.

### Trigger

Compile mesh.

### Expected result

REGION is injected into the mesh app environment, not automatically into dependency Compose services.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh service env sets `REGION=mesh`; service also has a local dependency with its own env.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- App gets REGION.
- Local dependency does not get REGION unless its own dependency env specifies it.

## MSH-004 — Direct top-level cross-service reference resolves

**Normative basis:** Direct mesh references use top-level service names.

### Situation / fixture

Gateway mesh env references `${backend.app.endpoints.http.network_url}`; backend has matching endpoint/scheme.

### Trigger

Compile mesh.

### Expected result

Reference resolves directly through backend app endpoint.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Gateway mesh env references `${backend.app.endpoints.http.network_url}`; backend has matching endpoint/scheme.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No `services.` prefix is needed.
- Resolved host is backend mesh app DNS identity.
- No lifecycle edge is inferred from env alone.

## MSH-005 — Logical dependency substitution happy path

**Normative basis:** Mesh dependencies bind logical slots to concrete providers.

### Situation / fixture

Frontend build.json declares local dependency slot `backend` with endpoint `http`; mesh binds frontend.dependencies.backend to top-level `backend` service.

### Trigger

Compile integrated mesh.

### Expected result

Frontend logical endpoint references resolve through backend app endpoint and local mock bundle is suppressed.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Frontend build.json declares local dependency slot `backend` with endpoint `http`; mesh binds frontend.dependencies.backend to top-level `backend` service.
3. Compile integrated mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Local backend dependency services/resources absent.
- Provider endpoint used.
- Automatic consumer->provider health edge exists.

## MSH-006 — Substitution of unknown consumer slot fails

**Normative basis:** Mesh can bind only declared effective dependency slots.

### Situation / fixture

Mesh sets frontend.dependencies.payments=`payments`, but frontend effective build.json has no `payments` dependency key.

### Trigger

Compile active mesh stage.

### Expected result

Builder fails provider-binding validation.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh sets frontend.dependencies.payments=`payments`, but frontend effective build.json has no `payments` dependency key.
3. Compile active mesh stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic names consumer, slot, provider, active stage.
- No new logical dependency is invented by mesh.

## MSH-007 — Substitution to unknown provider fails

**Normative basis:** Provider service must exist effectively.

### Situation / fixture

Frontend has valid backend slot; mesh binds it to nonexistent `therealbackend`.

### Trigger

Compile mesh.

### Expected result

Builder fails before reference resolution/runtime.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Frontend has valid backend slot; mesh binds it to nonexistent `therealbackend`.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic identifies missing top-level provider.
- Local dependency is not silently retained as fallback.

## MSH-008 — Provider compatibility is usage-driven, not full-shape equality

**Normative basis:** Only effective references/usages define provider compatibility.

### Situation / fixture

Logical local dependency declares endpoints http, metrics, admin; consumer env only references http.network_url. Provider app exposes only http with scheme.

### Trigger

Compile mesh substitution.

### Expected result

Compatibility succeeds because every actually consumed property is satisfiable.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Logical local dependency declares endpoints http, metrics, admin; consumer env only references http.network_url. Provider app exposes only http with scheme.
3. Compile mesh substitution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No failure for missing unused metrics/admin endpoints.
- http resolves through provider.

## MSH-009 — Missing consumed provider endpoint fails

**Normative basis:** Endpoint names are contractually significant.

### Situation / fixture

Consumer references logical endpoint `metrics.network_host`; provider app exposes only `http`.

### Trigger

Compile mesh.

### Expected result

Builder fails because exact consumed endpoint name is absent.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer references logical endpoint `metrics.network_host`; provider app exposes only `http`.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error identifies logical slot endpoint and provider service.
- Builder does not map metrics to http.

## MSH-010 — Provider host property does not require scheme

**Normative basis:** Compatibility requirements are property-specific.

### Situation / fixture

Consumer uses `${dependencies.backend.endpoints.http.network_host}`; provider http endpoint has port/primary but no scheme.

### Trigger

Compile mesh.

### Expected result

Substitution succeeds because network_host requires endpoint existence only.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer uses `${dependencies.backend.endpoints.http.network_host}`; provider http endpoint has port/primary but no scheme.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Resolved host is provider app host.
- No false missing-scheme error.

## MSH-011 — Provider network_url requires scheme

**Normative basis:** Provider endpoint supplies its own scheme.

### Situation / fixture

Same as MSH-010 but consumer uses network_url.

### Trigger

Compile mesh.

### Expected result

Builder fails because provider endpoint lacks scheme.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Same as MSH-010 but consumer uses network_url.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic states URL property requires scheme.
- Builder does not inherit scheme from local/default dependency.

## MSH-012 — Provider public property requires provider publication

**Normative basis:** public_* compatibility requires effective provider publication.

### Situation / fixture

Consumer effective reference uses logical dependency public_port; provider app endpoint declares publicPort but provider mesh service does not publish it.

### Trigger

Compile mesh.

### Expected result

Builder fails because provider endpoint is not effectively published.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer effective reference uses logical dependency public_port; provider app endpoint declares publicPort but provider mesh service does not publish it.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Build-level publicPort capability alone is insufficient.
- Error directs attention to provider publication.

## MSH-013 — Provider port may differ from local dependency port

**Normative basis:** Provider endpoint values replace local implementation details.

### Situation / fixture

Local mock logical http endpoint is port 3000; provider app http endpoint is port 8080; consumer references network_port/url.

### Trigger

Compile substitution.

### Expected result

Reference resolves to provider port 8080 without compatibility error.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Local mock logical http endpoint is port 3000; provider app http endpoint is port 8080; consumer references network_port/url.
3. Compile substitution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No exact port equality check.
- Resolved network_url includes 8080.

## MSH-014 — Provider scheme may differ and is authoritative

**Normative basis:** Provider scheme is resolved from provider endpoint.

### Situation / fixture

Local logical endpoint scheme is http; provider app endpoint same name uses https; consumer references network_url.

### Trigger

Compile substitution.

### Expected result

Resolved URL uses provider scheme https.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Local logical endpoint scheme is http; provider app endpoint same name uses https; consumer references network_url.
3. Compile substitution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No equality failure solely for scheme difference.
- Builder does not force local scheme onto provider.

## MSH-015 — Provider endpoint name mapping is exact only

**Normative basis:** Endpoint names are part of the contract.

### Situation / fixture

Local slot exposes endpoint `rest`; provider exposes `http` with otherwise compatible properties.

### Trigger

Consumer references dependencies.slot.endpoints.rest.network_url and compile.

### Expected result

Builder fails; it does not guess semantic aliases.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Local slot exposes endpoint `rest`; provider exposes `http` with otherwise compatible properties.
3. Consumer references dependencies.slot.endpoints.rest.network_url and compile.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error names missing provider app endpoint `rest`.
- No fuzzy/primary-based mapping occurs.

## MSH-016 — Unused local endpoints do not constrain provider

**Normative basis:** Extra logical endpoints are irrelevant unless effectively used.

### Situation / fixture

Local dependency contains endpoint `legacy-admin` whose owner has publicPort; consumer never references/publishes it after substitution.

### Trigger

Compile with provider lacking legacy-admin.

### Expected result

Substitution succeeds.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Local dependency contains endpoint `legacy-admin` whose owner has publicPort; consumer never references/publishes it after substitution.
3. Compile with provider lacking legacy-admin.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No compatibility validation for unused endpoint.
- Local legacy implementation remains suppressed.

## MSH-017 — Substitution atomically suppresses local helpers/resources

**Normative basis:** Substitution is atomic suppression.

### Situation / fixture

Local slot Compose includes mock, db, helper, volume/config/secret; provider is top-level actual service.

### Trigger

Compile mesh.

### Expected result

No part of local bundle survives substitution.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Local slot Compose includes mock, db, helper, volume/config/secret; provider is top-level actual service.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No local services.
- No local volume/config/secret/network.
- No orphan internal references.

## MSH-018 — Unsubstituted local dependencies still materialize

**Normative basis:** Mesh substitution is slot-specific.

### Situation / fixture

Frontend has backend and redis dependencies; bind only backend to provider.

### Trigger

Compile mesh dev/prod.

### Expected result

Redis local dependency remains materialized normally.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Frontend has backend and redis dependencies; bind only backend to provider.
3. Compile mesh dev/prod.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Redis owner and companions exist.
- Frontend waits for redis owner and backend provider.

## MSH-019 — Same logical slot name may bind to different providers by consumer

**Normative basis:** Logical dependency identity is consumer-scoped.

### Situation / fixture

Services A and B each declare logical slot `store`; mesh binds A->store-a and B->store-b.

### Trigger

Compile mesh.

### Expected result

Each consumer resolves its own logical slot independently.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Services A and B each declare logical slot `store`; mesh binds A->store-a and B->store-b.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- A references provider A.
- B references provider B.
- No global meaning is assigned to slot name `store`.

## MSH-020 — Multiple consumers may share one provider

**Normative basis:** Providers are concrete mesh services and can satisfy multiple consumers.

### Situation / fixture

Frontend, worker, and gateway each declare compatible logical backend slot and bind to `backend`.

### Trigger

Compile mesh.

### Expected result

Single top-level backend provider satisfies all bindings.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Frontend, worker, and gateway each declare compatible logical backend slot and bind to `backend`.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- One provider app service.
- Three substitution lifecycle edges.
- All local backend mocks suppressed.

## MSH-021 — Stage overlay can replace a dependency binding

**Normative basis:** Mesh dependency binding map deep-merges and scalar provider values replace.

### Situation / fixture

Base frontend slot backend binds to `backend`; e2e overlay binds same key to `fake-backend`.

### Trigger

Compile prod and e2e.

### Expected result

Prod uses backend; e2e uses fake-backend.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base frontend slot backend binds to `backend`; e2e overlay binds same key to `fake-backend`.
3. Compile prod and e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Effective provider changes only in E2E.
- Local slot remains suppressed in both because both stages bind it.

## MSH-022 — Stage can add provider and binding together

**Normative basis:** Mesh stages may add services and dependency bindings.

### Situation / fixture

Base mesh lacks `fake-payments`; E2E services adds fake-payments with path and binds frontend payments slot to it.

### Trigger

Compile prod then e2e.

### Expected result

Prod has no fake-payments; E2E adds provider and valid binding.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base mesh lacks `fake-payments`; E2E services adds fake-payments with path and binds frontend payments slot to it.
3. Compile prod then e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- E2E stage-added provider loads its build.json.
- Binding resolves after overlay.

## MSH-023 — Base binding to stage-only provider fails outside that stage

**Normative basis:** Validation is against effective active-stage mesh.

### Situation / fixture

Base frontend binds slot to `fake`; only e2e overlay defines top-level fake service.

### Trigger

Compile dev.

### Expected result

Builder fails active-stage validation because provider is unavailable.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base frontend binds slot to `fake`; only e2e overlay defines top-level fake service.
3. Compile dev.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- It does not assume future-stage service existence.
- Error includes active dev stage.

## MSH-024 — Stage may replace service path

**Normative basis:** Scalar stage service fields such as path may replace base.

### Situation / fixture

Base service path points to implementation A; e2e overlay replaces path with implementation B that has a valid build.json.

### Trigger

Compile prod and e2e.

### Expected result

Each stage loads service truth from its effective path.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base service path points to implementation A; e2e overlay replaces path with implementation B that has a valid build.json.
3. Compile prod and e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Prod endpoints/config from A.
- E2E endpoints/config from B.
- No destructive mutation of base config.

## MSH-025 — Stage-added service requires effective path

**Normative basis:** A newly added mesh service requires path.

### Situation / fixture

E2E overlay adds service `fake-payments` with env only and no base counterpart/path.

### Trigger

Compile e2e.

### Expected result

Builder fails because effective stage-added service lacks path.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. E2E overlay adds service `fake-payments` with env only and no base counterpart/path.
3. Compile e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error points to e2e.services.fake-payments.path.
- No directory is guessed.

## MSH-026 — Mesh stage has no service removal syntax

**Normative basis:** V2 overlays are non-destructive.

### Situation / fixture

Base defines backend; stage attempts a null/delete-like value or unsupported removal marker.

### Trigger

Validate/compile the stage.

### Expected result

Builder rejects invalid shape or retains base according to valid overlay semantics; it never interprets an undocumented removal syntax.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base defines backend; stage attempts a null/delete-like value or unsupported removal marker.
3. Validate/compile the stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Backend remains when omitted.
- No magic null/delete behavior exists.

## MSH-027 — Substitution automatically creates provider health edge

**Normative basis:** Lifecycle transfers to provider automatically.

### Situation / fixture

Consumer has bound slot but no explicit mesh dependsOn.

### Trigger

Compile mesh.

### Expected result

Consumer app still waits for provider health.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer has bound slot but no explicit mesh dependsOn.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Edge exists.
- Condition service_healthy.
- No local owner edge remains for suppressed bundle.

## MSH-028 — Direct substitution cycle fails

**Normative basis:** Substitution participates in lifecycle cycle validation.

### Situation / fixture

A binds slot to B and B binds slot to A.

### Trigger

Compile mesh.

### Expected result

Automatic substitution edges create a cycle and Builder rejects it.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. A binds slot to B and B binds slot to A.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Cycle diagnostic names A and B.
- No local fallback is used to break cycle.

## MSH-029 — Mixed substitution/explicit lifecycle cycle fails

**Normative basis:** All effective lifecycle edges share one validated graph.

### Situation / fixture

A substitutes dependency to B; B dependsOn C; C dependsOn A.

### Trigger

Compile mesh.

### Expected result

Builder detects cycle across automatic and explicit edge types.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. A substitutes dependency to B; B dependsOn C; C dependsOn A.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic traces mixed logical graph.
- No service_started workaround.

## MSH-030 — Valid substitution chain succeeds

**Normative basis:** Logical substitution composes recursively across mesh services.

### Situation / fixture

Gateway slot frontend -> frontend provider; frontend slot backend -> backend provider; backend local redis.

### Trigger

Compile mesh.

### Expected result

Acyclic chain resolves correctly and local redis remains backend-owned.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Gateway slot frontend -> frontend provider; frontend slot backend -> backend provider; backend local redis.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Gateway ref points to frontend app.
- Frontend ref points to backend app.
- Backend local redis remains materialized.

## MSH-031 — Explicit dependsOn remains independent of dependency binding

**Normative basis:** Mesh dependsOn and logical binding have distinct responsibilities.

### Situation / fixture

Gateway directly references metrics service lifecycle but has no logical dependency slot for it.

### Trigger

Declare mesh dependsOn metrics and compile.

### Expected result

Explicit top-level lifecycle ordering is valid independently of substitution.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Gateway directly references metrics service lifecycle but has no logical dependency slot for it.
3. Declare mesh dependsOn metrics and compile.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Gateway waits for metrics health.
- No synthetic gateway logical dependency appears.

## MSH-032 — Duplicating substitution target in dependsOn is unnecessary but deterministic

**Normative basis:** Substitution-created edges need not be duplicated.

### Situation / fixture

Consumer binds backend slot to backend and also lists backend in dependsOn.

### Trigger

Compile repeatedly.

### Expected result

Generated lifecycle remains a valid single semantic health requirement without conflicting duplicate conditions.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer binds backend slot to backend and also lists backend in dependsOn.
3. Compile repeatedly.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Deterministic output.
- No duplicate condition variants.

## MSH-033 — Local dependency can be published when not substituted

**Normative basis:** Mesh may publish endpoints of materialized local dependencies.

### Situation / fixture

Consumer local dependency `mailpit` has publicPort endpoint and mesh publish selects it; no binding for mailpit exists.

### Trigger

Compile mesh.

### Expected result

Local mailpit endpoint becomes effectively host-published.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer local dependency `mailpit` has publicPort endpoint and mesh publish selects it; no binding for mailpit exists.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Local bundle materializes.
- Host mapping targets endpoint owner.
- Consumer-scoped public_* reference resolves.

## MSH-034 — Substituted dependency cannot be published through consumer

**Normative basis:** Publish provider app endpoint on provider service instead.

### Situation / fixture

Consumer binds logical mail slot to top-level mailer but publish contains `dependencies.mail.endpoints.http`.

### Trigger

Compile mesh.

### Expected result

Builder fails instead of publishing the suppressed local endpoint or proxying provider through consumer.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer binds logical mail slot to top-level mailer but publish contains `dependencies.mail.endpoints.http`.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error identifies substituted slot publish target.
- No local mail bundle materializes.

## MSH-035 — Published provider satisfies logical public reference

**Normative basis:** Effective slot references resolve through provider publication.

### Situation / fixture

Consumer binds backend slot to provider; consumer env references logical public_url; provider app endpoint has publicPort/scheme and provider mesh publish selects it.

### Trigger

Compile mesh.

### Expected result

Consumer logical public_url resolves to provider effective public URL.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer binds backend slot to provider; consumer env references logical public_url; provider app endpoint has publicPort/scheme and provider mesh publish selects it.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- URL is host-reachable provider port.
- No local endpoint publication occurs.

## MSH-036 — Mesh cannot override endpoint definitions

**Normative basis:** Endpoint definitions are build.json responsibility.

### Situation / fixture

Put endpoint-like fields such as port/publicPort/scheme under mesh service configuration or stage service configuration.

### Trigger

Validate mesh.

### Expected result

Builder rejects unsupported endpoint mutation fields.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Put endpoint-like fields such as port/publicPort/scheme under mesh service configuration or stage service configuration.
3. Validate mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- User must change service build.json instead.
- No mesh-side endpoint shape is merged into service truth.

## MSH-037 — Direct app reference does not require a logical slot

**Normative basis:** Mesh permits direct top-level endpoint references.

### Situation / fixture

Gateway env directly references backend.app endpoint but gateway build.json has no backend dependency slot.

### Trigger

Compile mesh.

### Expected result

Direct reference resolves as cross-service wiring.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Gateway env directly references backend.app endpoint but gateway build.json has no backend dependency slot.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No substitution occurs.
- No automatic lifecycle edge from direct env reference.

## MSH-038 — Same logical reference expression resolves differently by stage binding

**Normative basis:** Application/service truth stays stable while composition changes provider identity.

### Situation / fixture

Frontend build.json contains `${dependencies.payments.endpoints.http.network_url}`; base mesh binds payments to real, e2e binds to fake.

### Trigger

Compile both stages.

### Expected result

The unchanged consumer expression resolves to each stage’s effective provider.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Frontend build.json contains `${dependencies.payments.endpoints.http.network_url}`; base mesh binds payments to real, e2e binds to fake.
3. Compile both stages.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Prod URL host=real provider.
- E2E URL host=fake provider.

## MSH-039 — Provider may expose extra endpoints without affecting compatibility

**Normative basis:** Provider compatibility is reference-driven.

### Situation / fixture

Provider app exposes http, metrics, admin; consumer logical slot only uses http.

### Trigger

Compile substitution.

### Expected result

Extra provider endpoints do not cause mismatch.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Provider app exposes http, metrics, admin; consumer logical slot only uses http.
3. Compile substitution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Compatibility passes.
- Unused endpoints are neither auto-published nor auto-injected.

## MSH-040 — Service-local infrastructure boundary is preserved

**Normative basis:** build.json is service truth; mesh does not centralize unbound infrastructure.

### Situation / fixture

Backend has local firebase dependency; root mesh composes backend but does not bind backend.firebase to any provider.

### Trigger

Compile integrated mesh.

### Expected result

Backend retains and materializes its own local firebase implementation.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Backend has local firebase dependency; root mesh composes backend but does not bind backend.firebase to any provider.
3. Compile integrated mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Firebase remains scoped to backend.
- Other mesh services do not implicitly own/redeclare it.
- Only explicit binding would substitute it.
