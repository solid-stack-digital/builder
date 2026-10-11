# Health, Readiness, and Lifecycle Ordering

> Builder V2 conformance test conditions. These scenarios are derived from the final V2 specification and are intended to serve as acceptance criteria for an implementation that does not yet exist.

## Scope

Required app/dependency healthchecks, automatic app dependency lifecycle, dependency-to-dependency ordering, mesh dependsOn, substitution-created lifecycle edges, cycle detection, and runtime proof that Builder uses `service_healthy` rather than container-start ordering.

## Test execution convention

Use the lowest test layer that can prove the invariant:

- **schema/config unit test** for JSON shape, field type, identifier, and unsupported-field validation;
- **compiler unit/integration test** for overlays, references, substitution, publication, namespacing, lifecycle graphs, port allocation, and generated Compose;
- **Docker/Compose integration test** for real health transitions, DNS reachability, environment propagation, host publication, and resource behavior;
- **CLI/E2E test** for command sequencing, exit-code propagation, cleanup, and black-box tester semantics.

A scenario passes only when both its positive behavior and its stated non-effects are verified.

## Scenario count

**35 scenarios**

## LIFE-001 — Every endpoint owner requires a valid healthcheck

**Normative basis:** Dependency readiness is defined only through valid healthchecks.

### Situation / fixture

Create a dependency endpoint owned by Compose service `db`; omit `db.healthcheck`.

### Trigger

Compile an integrated composition where the dependency is materialized.

### Expected result

Builder fails before runtime. It must not synthesize a healthcheck or downgrade readiness.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create a dependency endpoint owned by Compose service `db`; omit `db.healthcheck`.
3. Compile an integrated composition where the dependency is materialized.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Failure identifies the dependency endpoint owner and missing healthcheck.
- No generated `service_started` edge appears.
- No containers are started from the invalid composition.

## LIFE-002 — One healthcheck satisfies multiple endpoints on one owner

**Normative basis:** Readiness is per distinct endpoint-owning service, not per endpoint.

### Situation / fixture

Expose `firestore`, `auth`, and `storage` endpoints from one Compose service `firebase-emulator` with one valid healthcheck.

### Trigger

Compile integrated service execution.

### Expected result

The single owner healthcheck satisfies all endpoint readiness requirements.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Expose `firestore`, `auth`, and `storage` endpoints from one Compose service `firebase-emulator` with one valid healthcheck.
3. Compile integrated service execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Compilation succeeds.
- App receives only one semantic health dependency on the distinct owner service.
- No duplicate services/healthchecks are generated per endpoint.

## LIFE-003 — Every distinct endpoint owner must be healthy

**Normative basis:** All distinct endpoint owners define dependency readiness.

### Situation / fixture

Dependency exposes endpoint `api` from `server-a` and endpoint `metrics` from `server-b`; only `server-a` has a healthcheck.

### Trigger

Compile integrated execution.

### Expected result

Builder fails because `server-b` is also part of the effective dependency surface.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency exposes endpoint `api` from `server-a` and endpoint `metrics` from `server-b`; only `server-a` has a healthcheck.
3. Compile integrated execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic identifies `server-b` and at least one endpoint it owns.
- `server-a` having a healthcheck does not mask the missing one.

## LIFE-004 — Auxiliary service does not gain a Builder health requirement

**Normative basis:** Builder adds health requirements only for endpoint owners.

### Situation / fixture

Bundle has endpoint owner `api` with healthcheck and helper `migrate` without any endpoint and without a healthcheck.

### Trigger

Compile integrated execution.

### Expected result

Builder accepts the bundle if its ordinary Compose model is valid.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Bundle has endpoint owner `api` with healthcheck and helper `migrate` without any endpoint and without a healthcheck.
3. Compile integrated execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No validation error is raised solely for `migrate`.
- App health edge targets `api`, not `migrate`.

## LIFE-005 — App automatically health-depends on a local dependency owner

**Normative basis:** App lifecycle for local dependencies is automatic.

### Situation / fixture

Create one materialized dependency with endpoint owner `redis` and a valid healthcheck; do not configure any app dependsOn field.

### Trigger

Compile `prod` or `dev --full`.

### Expected result

Builder automatically creates a health-gated app lifecycle edge.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create one materialized dependency with endpoint owner `redis` and a valid healthcheck; do not configure any app dependsOn field.
3. Compile `prod` or `dev --full`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Generated app `depends_on` points to the generated redis owner.
- Condition is exactly `service_healthy`.
- No user `app.dependsOn` is required or permitted.

## LIFE-006 — App waits for all distinct owners of one dependency

**Normative basis:** Dependency readiness is the conjunction of all endpoint-owner health states.

### Situation / fixture

Dependency exposes endpoints from `api`, `metrics`, and `admin`, each with a healthcheck.

### Trigger

Compile integrated execution.

### Expected result

App health-depends on all three owner services.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency exposes endpoints from `api`, `metrics`, and `admin`, each with a healthcheck.
3. Compile integrated execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Three distinct semantic owner edges exist.
- Every edge uses `service_healthy`.
- Primary endpoint status does not reduce the owner set.

## LIFE-007 — App waits across multiple materialized dependencies

**Normative basis:** Lifecycle is independent of environment reference usage.

### Situation / fixture

Declare materialized dependencies `postgres`, `redis`, and `search`, each with one valid endpoint owner.

### Trigger

Compile integrated execution.

### Expected result

App is gated by every local dependency readiness service.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Declare materialized dependencies `postgres`, `redis`, and `search`, each with one valid endpoint owner.
3. Compile integrated execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- App has health dependencies covering all three logical dependencies.
- No dependency is omitted because the app lacks an env reference to it.

## LIFE-008 — Isolated stages do not materialize or gate local dependencies

**Normative basis:** Isolated execution suppresses local dependency materialization.

### Situation / fixture

Use the same service fixture with valid dependencies.

### Trigger

Compile plain `dev` and `test-unit`.

### Expected result

Local dependencies are absent and the app/test target has no generated lifecycle edges to them.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Use the same service fixture with valid dependencies.
3. Compile plain `dev` and `test-unit`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No local dependency services appear.
- No stale `depends_on` targets remain.
- `INFRA_MODE` is isolated.

## LIFE-009 — Dependency dependsOn requires fully-qualified syntax

**Normative basis:** Build-level dependency lifecycle references use `dependencies.<name>`.

### Situation / fixture

Set dependency `worker.dependsOn` to bare `"redis"` instead of `"dependencies.redis"`.

### Trigger

Validate the active integrated composition.

### Expected result

Builder rejects the lifecycle reference.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Set dependency `worker.dependsOn` to bare `"redis"` instead of `"dependencies.redis"`.
3. Validate the active integrated composition.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error points to `dependencies.worker.dependsOn` and offending value.
- Builder does not auto-prefix or guess the target.

## LIFE-010 — Dependency self-dependency is rejected

**Normative basis:** Self-dependency is invalid.

### Situation / fixture

Dependency `redis` declares `dependsOn: ["dependencies.redis"]`.

### Trigger

Compile any stage where it is materialized.

### Expected result

Builder fails cycle/self-reference validation before runtime.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency `redis` declares `dependsOn: ["dependencies.redis"]`.
3. Compile any stage where it is materialized.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic names the self-edge.
- No service is started.

## LIFE-011 — Unknown dependency target is rejected

**Normative basis:** Every dependsOn target must resolve.

### Situation / fixture

Dependency `worker` declares `dependsOn: ["dependencies.missing"]`.

### Trigger

Compile integrated stage.

### Expected result

Builder fails because the target does not exist in the effective stage.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency `worker` declares `dependsOn: ["dependencies.missing"]`.
3. Compile integrated stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error identifies `missing`.
- No target is silently omitted.

## LIFE-012 — Inert dependency target is rejected

**Normative basis:** dependsOn cannot require an inert dependency.

### Situation / fixture

Declare target dependency `seed` with no effective endpoints; materialized `worker` depends on it.

### Trigger

Compile integrated stage.

### Expected result

Builder fails because an inert module cannot provide Builder readiness.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Declare target dependency `seed` with no effective endpoints; materialized `worker` depends on it.
3. Compile integrated stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error distinguishes declared-but-unmaterialized target from an unknown target where possible.
- Seed is not force-materialized.

## LIFE-013 — Direct two-node dependency cycle is rejected

**Normative basis:** Dependency lifecycle graph must be acyclic.

### Situation / fixture

Dependencies `a` and `b` each expose valid endpoints and declare `a -> b` and `b -> a`.

### Trigger

Compile integrated stage.

### Expected result

Builder detects the cycle before generating runnable Compose.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependencies `a` and `b` each expose valid endpoints and declare `a -> b` and `b -> a`.
3. Compile integrated stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic contains the logical cycle path.
- No attempt is made to break or reorder the cycle.

## LIFE-014 — Long dependency cycle is rejected

**Normative basis:** Cycle validation covers transitive dependency graphs.

### Situation / fixture

Create `a -> b -> c -> d -> a`, all otherwise valid materialized dependencies.

### Trigger

Compile integrated stage.

### Expected result

Builder finds the multi-hop cycle deterministically.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create `a -> b -> c -> d -> a`, all otherwise valid materialized dependencies.
3. Compile integrated stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error identifies enough of the cycle to locate every involved logical module.
- No partial composition starts.

## LIFE-015 — Module dependsOn expands from each dependent owner to target readiness owners

**Normative basis:** Dependency dependsOn is module-level but expands through owner/readiness services.

### Situation / fixture

Dependency `api` has two endpoint owners; target `db` has two endpoint owners. `api.dependsOn=["dependencies.db"]`.

### Trigger

Compile integrated execution and inspect generated lifecycle graph.

### Expected result

Every distinct endpoint owner of `api` is health-gated on the readiness services of `db`.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency `api` has two endpoint owners; target `db` has two endpoint owners. `api.dependsOn=["dependencies.db"]`.
3. Compile integrated execution and inspect generated lifecycle graph.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Both API owners wait for both DB readiness owners, or an equivalent generated structure enforces the same conjunction.
- Every Builder-generated condition is `service_healthy`.

## LIFE-016 — Auxiliary service of a dependent module is not automatically Builder-gated

**Normative basis:** Auxiliary services are not promoted into the Builder endpoint lifecycle surface.

### Situation / fixture

Dependency `api` includes endpoint owner `server` plus helper `seed`; `api` depends on `db`.

### Trigger

Compile integrated execution.

### Expected result

Builder’s module-level health expansion applies to `server`; helper lifecycle remains governed by the dependency Compose file.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency `api` includes endpoint owner `server` plus helper `seed`; `api` depends on `db`.
3. Compile integrated execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No extra Builder edge to `seed` is required solely because it belongs to `api`.
- Original Compose internal edges remain intact.

## LIFE-017 — Stage dependsOn union adds lifecycle without removing base

**Normative basis:** Dependency dependsOn stage arrays union-merge.

### Situation / fixture

Base `worker.dependsOn` contains redis; E2E overlay adds mailpit.

### Trigger

Compile base stage and E2E.

### Expected result

E2E dependency lifecycle includes both targets in base-first order, with exact duplicates removed.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base `worker.dependsOn` contains redis; E2E overlay adds mailpit.
3. Compile base stage and E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Base stage only contains redis edge.
- E2E contains redis and mailpit.
- All generated edges are health-gated.

## LIFE-018 — Environment reference does not synthesize dependency dependsOn

**Normative basis:** Environment wiring and lifecycle ordering are separate concepts.

### Situation / fixture

Dependency `worker.env.REDIS_HOST` references `${dependencies.redis.endpoints.redis.network_host}` but `worker.dependsOn` is absent.

### Trigger

Compile integrated execution.

### Expected result

Reference resolves, but Builder does not create a worker-to-redis dependency-module edge solely from env wiring.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency `worker.env.REDIS_HOST` references `${dependencies.redis.endpoints.redis.network_host}` but `worker.dependsOn` is absent.
3. Compile integrated execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No lifecycle edge exists between worker owner and redis because of the env reference alone.
- App still gets its automatic edges to both local dependencies independently.

## LIFE-019 — Mesh explicit dependsOn health-gates target app

**Normative basis:** Mesh service dependsOn defines explicit lifecycle ordering.

### Situation / fixture

Mesh service `gateway` declares `dependsOn:["backend"]`; both service Dockerfiles satisfy required healthchecks.

### Trigger

Compile mesh dev/prod.

### Expected result

Gateway app is gated on backend app health.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh service `gateway` declares `dependsOn:["backend"]`; both service Dockerfiles satisfy required healthchecks.
3. Compile mesh dev/prod.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Generated relation points to backend app service.
- Condition is `service_healthy`.
- The edge exists even if gateway env does not reference backend.

## LIFE-020 — Unknown mesh dependsOn target fails

**Normative basis:** Every mesh dependsOn target must be an effective top-level service.

### Situation / fixture

Mesh service `gateway` depends on `missing-service`.

### Trigger

Compile active mesh stage.

### Expected result

Builder rejects the unresolved lifecycle target.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh service `gateway` depends on `missing-service`.
3. Compile active mesh stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error includes source service, dependsOn value, active stage.
- No edge is silently dropped.

## LIFE-021 — Mesh self-dependency fails

**Normative basis:** Mesh lifecycle self-edges are invalid.

### Situation / fixture

Mesh service `backend` declares `dependsOn:["backend"]`.

### Trigger

Compile mesh.

### Expected result

Builder fails self-dependency validation.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh service `backend` declares `dependsOn:["backend"]`.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No Docker execution starts.
- Diagnostic identifies service and self-edge.

## LIFE-022 — Mesh lifecycle cycle fails

**Normative basis:** Mesh lifecycle graph must be acyclic.

### Situation / fixture

Create top-level services `a -> b -> c -> a` with valid builds.

### Trigger

Compile mesh.

### Expected result

Builder detects and rejects the cycle.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create top-level services `a -> b -> c -> a` with valid builds.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Cycle diagnostic uses mesh service identities.
- Subsequent Compose execution is not attempted.

## LIFE-023 — Mesh env reference does not synthesize mesh dependsOn

**Normative basis:** Cross-service environment wiring does not imply ordering.

### Situation / fixture

Gateway env references `${backend.app.endpoints.http.network_url}` but gateway has no dependsOn and no substituted dependency slot to backend.

### Trigger

Compile mesh.

### Expected result

The URL resolves but no lifecycle edge is created.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Gateway env references `${backend.app.endpoints.http.network_url}` but gateway has no dependsOn and no substituted dependency slot to backend.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Gateway environment contains resolved URL.
- Generated lifecycle graph has no gateway->backend edge from that reference.

## LIFE-024 — Substitution transfers lifecycle automatically

**Normative basis:** Substitution-created provider lifecycle is automatic.

### Situation / fixture

Frontend logical dependency `backend` is bound by mesh to top-level service `backend`; no explicit frontend mesh dependsOn is set.

### Trigger

Compile mesh integrated stage.

### Expected result

Frontend app is automatically health-gated on provider backend app.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Frontend logical dependency `backend` is bound by mesh to top-level service `backend`; no explicit frontend mesh dependsOn is set.
3. Compile mesh integrated stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Local backend-mock owner is absent.
- Provider app health edge exists.
- Condition is `service_healthy`.

## LIFE-025 — Explicit duplicate provider dependsOn does not weaken or double lifecycle semantics

**Normative basis:** Substitution edge and explicit edge have the same health-gated target semantics.

### Situation / fixture

Consumer substitutes logical dependency to provider `backend` and also explicitly lists `backend` in mesh dependsOn.

### Trigger

Compile mesh.

### Expected result

Effective lifecycle still represents one health requirement on the provider; duplicate declarations do not create conflicting conditions.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer substitutes logical dependency to provider `backend` and also explicitly lists `backend` in mesh dependsOn.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No `service_started` duplicate appears.
- Generated Compose is valid and deterministic.
- Provider health remains required.

## LIFE-026 — Substitution-created lifecycle cycle is rejected

**Normative basis:** Substitution edges participate in lifecycle validation.

### Situation / fixture

Service `frontend` substitutes a dependency to `backend`; backend explicitly dependsOn frontend.

### Trigger

Compile mesh.

### Expected result

Builder includes the automatic substitution edge in cycle detection and fails.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Service `frontend` substitutes a dependency to `backend`; backend explicitly dependsOn frontend.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic explains cycle involving frontend and backend.
- Local dependency suppression does not proceed into runnable partial state.

## LIFE-027 — Valid mixed lifecycle chain compiles

**Normative basis:** Mesh, substitution, and local dependency lifecycle compose together.

### Situation / fixture

Mesh: gateway dependsOn frontend; frontend logical backend dependency is substituted to backend; backend has local redis dependency.

### Trigger

Compile integrated mesh.

### Expected result

The acyclic chain compiles with gateway -> frontend -> backend app health, while backend app also waits for local redis owner health.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh: gateway dependsOn frontend; frontend logical backend dependency is substituted to backend; backend has local redis dependency.
3. Compile integrated mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- All edges use `service_healthy`.
- No accidental gateway->redis direct edge is created.
- Topological ordering can be derived without cycles.

## LIFE-028 — Many consumers can wait on one provider

**Normative basis:** A top-level provider may satisfy multiple logical slots.

### Situation / fixture

Three mesh services each bind a logical dependency slot to top-level `identity` provider.

### Trigger

Compile mesh.

### Expected result

Each consumer receives an independent health dependency on the same provider app.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Three mesh services each bind a logical dependency slot to top-level `identity` provider.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Provider is materialized once as top-level service.
- All consumers are gated on provider health.
- No consumer’s local substituted implementation remains.

## LIFE-029 — Mesh dev lifecycle uses provider dev healthcheck

**Normative basis:** Mesh app health comes from target service healthcheck for active execution.

### Situation / fixture

Provider Dockerfile has distinguishable valid dev/prod healthchecks; compile `mesh dev`.

### Trigger

Inspect selected app target/health model.

### Expected result

Mesh dev uses the provider’s dev application target/readiness.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Provider Dockerfile has distinguishable valid dev/prod healthchecks; compile `mesh dev`.
3. Inspect selected app target/health model.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Generated build target is dev.
- Lifecycle waits on the healthcheck inherited/defined by dev.

## LIFE-030 — Mesh prod and global E2E use production app health readiness

**Normative basis:** Build target selection is separate from E2E runtime stage.

### Situation / fixture

Use distinct valid dev/prod healthchecks, and define e2e runtime env.

### Trigger

Compile mesh prod and mesh global E2E.

### Expected result

Prod uses prod health; E2E app images also use prod targets while runtime stage/config is e2e.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Use distinct valid dev/prod healthchecks, and define e2e runtime env.
3. Compile mesh prod and mesh global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- E2E does not switch app image target to test-e2e.
- Provider/consumer health gating uses production-runtime app healthchecks.
- Tester remains the finite E2E runner.

## LIFE-031 — Unhealthy local dependency blocks app at runtime

**Normative basis:** Generated lifecycle edge must enforce actual health, not mere container creation.

### Situation / fixture

Create endpoint owner healthcheck that deliberately remains unhealthy for a bounded test period; app command writes a marker immediately on start.

### Trigger

Run integrated composition under an integration-test timeout.

### Expected result

App must not start its normal process while the required endpoint owner is unhealthy.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create endpoint owner healthcheck that deliberately remains unhealthy for a bounded test period; app command writes a marker immediately on start.
3. Run integrated composition under an integration-test timeout.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Marker is absent during unhealthy period.
- Docker reports owner unhealthy/startup and app waiting.
- There is no service_started fallback.

## LIFE-032 — App proceeds after dependency becomes healthy

**Normative basis:** service_healthy readiness is dynamic and gating.

### Situation / fixture

Dependency healthcheck initially fails then succeeds after fixture writes readiness marker.

### Trigger

Run integrated composition.

### Expected result

App starts only after the dependency transitions healthy.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency healthcheck initially fails then succeeds after fixture writes readiness marker.
3. Run integrated composition.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Dependency health transition precedes app process marker.
- App eventually becomes healthy itself.
- No manual restart is needed.

## LIFE-033 — Unhealthy mesh target blocks dependent app

**Normative basis:** Mesh lifecycle edges are health-gated.

### Situation / fixture

Backend app healthcheck intentionally remains unhealthy; gateway explicitly dependsOn backend.

### Trigger

Run mesh with timeout.

### Expected result

Gateway normal runtime does not begin before backend is healthy.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Backend app healthcheck intentionally remains unhealthy; gateway explicitly dependsOn backend.
3. Run mesh with timeout.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Backend container may be running but unhealthy.
- Gateway waits because condition is `service_healthy`, not `service_started`.

## LIFE-034 — Global tester waits for effective top-level applications

**Normative basis:** Global tester is health-gated on effective top-level applications.

### Situation / fixture

Define two top-level apps whose healthchecks become healthy at different controlled times and a global tester that immediately records its start.

### Trigger

Run global E2E.

### Expected result

Tester runner begins only after required effective top-level application services are healthy.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Define two top-level apps whose healthchecks become healthy at different controlled times and a global tester that immediately records its start.
3. Run global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Tester marker timestamp is later than both app healthy markers.
- Stage-added effective services are included when applicable.

## LIFE-035 — Service-level tester waits for application health

**Normative basis:** Service-level E2E runner waits for app health.

### Situation / fixture

Service prod app takes a controlled delay before its healthcheck succeeds; test-e2e target exits immediately if APP_URL is unreachable.

### Trigger

Run `builder service up test-e2e`.

### Expected result

Builder delays tester execution until the application is healthy.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Service prod app takes a controlled delay before its healthcheck succeeds; test-e2e target exits immediately if APP_URL is unreachable.
3. Run `builder service up test-e2e`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Tester does not fail from an early connection race.
- Recorded tester start occurs after app readiness.
- Tester exit code is then propagated.
