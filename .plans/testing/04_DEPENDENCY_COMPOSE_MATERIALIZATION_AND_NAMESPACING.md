# Dependency Compose Materialization, Atomicity, and Namespacing

> Builder V2 conformance test conditions. These scenarios are derived from the final V2 specification and are intended to serve as acceptance criteria for an implementation that does not yet exist.

## Scope

Atomic dependency implementation semantics, materialization/inertness, module-wide dependency environment, Compose feature support/restrictions, internal-reference rewriting, collision isolation, stage implementation replacement, and atomic suppression under mesh substitution.

## Test execution convention

Use the lowest test layer that can prove the invariant:

- **schema/config unit test** for JSON shape, field type, identifier, and unsupported-field validation;
- **compiler unit/integration test** for overlays, references, substitution, publication, namespacing, lifecycle graphs, port allocation, and generated Compose;
- **Docker/Compose integration test** for real health transitions, DNS reachability, environment propagation, host publication, and resource behavior;
- **CLI/E2E test** for command sequencing, exit-code propagation, cleanup, and black-box tester semantics.

A scenario passes only when both its positive behavior and its stated non-effects are verified.

## Scenario count

**40 scenarios**

## DEP-001 — Endpoint-less dependency is inert

**Normative basis:** A dependency with no effective endpoints is inert.

### Situation / fixture

Declare dependency `cache` with a valid Compose file containing `redis` plus a named volume, but omit `dependencies.cache.endpoints`.

### Trigger

Compile/run an integrated standalone stage such as `prod`.

### Expected result

Compilation succeeds, but the dependency is not materialized because its effective endpoint collection is absent.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Declare dependency `cache` with a valid Compose file containing `redis` plus a named volume, but omit `dependencies.cache.endpoints`.
3. Compile/run an integrated standalone stage such as `prod`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No generated `cache` service exists.
- No cache-owned volume/network/config/secret is emitted.
- The app receives no automatic lifecycle edge to `cache`.
- No host port is reserved for the inert dependency.

## DEP-002 — Explicit empty endpoint map is inert

**Normative basis:** Endpoint declaration, not Compose service presence, controls materialization.

### Situation / fixture

Declare `endpoints: {}` on an otherwise valid multi-service dependency Compose bundle.

### Trigger

Compile `dev --full` and `prod`.

### Expected result

The explicit empty map has the same semantics as omission: no dependency implementation is materialized.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Declare `endpoints: {}` on an otherwise valid multi-service dependency Compose bundle.
3. Compile `dev --full` and `prod`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Zero services from the dependency bundle are emitted in both stages.
- Its resources are absent.
- Compilation does not treat the Compose file’s own services as implicit endpoints.

## DEP-003 — Integrated materialization includes endpoint dependency

**Normative basis:** Dependencies with effective endpoints materialize in integrated compositions.

### Situation / fixture

Declare one dependency endpoint owned by Compose service `redis`, with a valid healthcheck.

### Trigger

Compile `dev --full` or `prod`.

### Expected result

The dependency implementation is materialized in integrated infrastructure mode.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Declare one dependency endpoint owned by Compose service `redis`, with a valid healthcheck.
3. Compile `dev --full` or `prod`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- The endpoint-owner service is present.
- The endpoint resolves to the namespaced service and declared port.
- The app has a `service_healthy` dependency on the owner.

## DEP-004 — Atomic multi-service implementation materializes companions

**Normative basis:** A materialized dependency loads its entire Compose implementation atomically.

### Situation / fixture

Create `firebase.compose.yml` with `emulator`, `ui`, and `seed-helper`; only `emulator` owns a declared endpoint, while the other two have no Builder endpoints.

### Trigger

Compile integrated service execution.

### Expected result

All three Compose services materialize as one atomic dependency implementation even though only one owns an endpoint.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create `firebase.compose.yml` with `emulator`, `ui`, and `seed-helper`; only `emulator` owns a declared endpoint, while the other two have no Builder endpoints.
3. Compile integrated service execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- All three services are present under isolated/namespaced generated identities.
- Internal Compose relationships still reference the correct generated peers.
- The app lifecycle edge is only to endpoint-owning readiness service(s), not automatically to every companion.

## DEP-005 — Multiple endpoint-owner services in one bundle

**Normative basis:** Each dependency endpoint explicitly selects its owner service.

### Situation / fixture

Create a dependency with endpoint `api` owned by `server` and endpoint `metrics` owned by `metrics`, both with healthchecks, plus helper service `init`.

### Trigger

Compile integrated service execution.

### Expected result

The entire bundle materializes and endpoint resolution preserves distinct owner services.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create a dependency with endpoint `api` owned by `server` and endpoint `metrics` owned by `metrics`, both with healthchecks, plus helper service `init`.
3. Compile integrated service execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Both endpoints resolve to different network hosts.
- Declared network ports remain exact.
- `init` remains present as a companion.
- The app is health-gated on both distinct endpoint owners.

## DEP-006 — Dependency env applies to every service

**Normative basis:** Dependency env is module-wide.

### Situation / fixture

Define dependency `firebase` with three Compose services and Builder env `{ "GCLOUD_PROJECT": "demo" }`.

### Trigger

Compile integrated execution.

### Expected result

Builder overlays the dependency env onto every service in the atomic dependency bundle.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Define dependency `firebase` with three Compose services and Builder env `{ "GCLOUD_PROJECT": "demo" }`.
3. Compile integrated execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Each generated service receives `GCLOUD_PROJECT=demo`.
- Pre-existing unrelated Compose environment is preserved according to Compose merge behavior.
- The env is not injected into the app merely because it belongs to the dependency.

## DEP-007 — Stage dependency env overlays base module-wide

**Normative basis:** Stage dependency env merges by key and applies to all implementation services.

### Situation / fixture

Base dependency env sets `A=base,B=base`; the active stage sets `B=stage,C=stage`; bundle has two services.

### Trigger

Compile the active stage.

### Expected result

Effective dependency env is keywise merged and applied to every service.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base dependency env sets `A=base,B=base`; the active stage sets `B=stage,C=stage`; bundle has two services.
3. Compile the active stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Both services receive `A=base`.
- Both receive `B=stage`.
- Both receive `C=stage`.
- No service-specific accidental divergence is introduced by Builder.

## DEP-008 — Dependency Compose may use image services

**Normative basis:** Dependency Compose may use `image:` internally.

### Situation / fixture

Use `image: redis:...` for the endpoint owner and another image-based helper.

### Trigger

Compile integrated mode.

### Expected result

Image-backed dependency services are accepted.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Use `image: redis:...` for the endpoint owner and another image-based helper.
3. Compile integrated mode.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Compilation succeeds.
- Image declarations are preserved.
- Builder still namespaces logical service/resource identity as required.

## DEP-009 — Dependency Compose may use build services

**Normative basis:** Dependency Compose may use `build:` internally.

### Situation / fixture

Use `build: ./mock-api` for a dependency endpoint owner with a valid healthcheck.

### Trigger

Compile from a service directory where the relative build context exists.

### Expected result

Build-backed dependency services are accepted and relative paths remain correctly rooted to the dependency/service project.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Use `build: ./mock-api` for a dependency endpoint owner with a valid healthcheck.
3. Compile from a service directory where the relative build context exists.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Build context resolves to the intended fixture directory.
- No path escape occurs.
- Endpoint resolves to the built service.

## DEP-010 — Named volume is namespaced and attached correctly

**Normative basis:** Dependency-owned named volumes are namespaced.

### Situation / fixture

Dependency Compose defines named volume `data` and mounts it into both `db` and `backup` services.

### Trigger

Compile two copies of the same service fixture in distinct mesh consumers.

### Expected result

Each dependency instance receives collision-isolated volume identity while internal mounts stay coherent.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency Compose defines named volume `data` and mounts it into both `db` and `backup` services.
3. Compile two copies of the same service fixture in distinct mesh consumers.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Consumer A and B do not share the volume unless explicitly designed outside Builder’s dependency ownership.
- Within each dependency instance both services reference that instance’s namespaced volume.

## DEP-011 — Configs are namespaced and rewritten

**Normative basis:** Dependency-owned configs are part of the atomic namespacing contract.

### Situation / fixture

Dependency Compose defines config `nginx-conf` consumed by service `proxy`.

### Trigger

Compile at least two dependency instances containing the same raw config name.

### Expected result

Builder produces isolated config resources and rewrites service references consistently.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency Compose defines config `nginx-conf` consumed by service `proxy`.
3. Compile at least two dependency instances containing the same raw config name.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No raw global config collision occurs.
- Each `proxy` consumes its own dependency’s config.

## DEP-012 — Compose secrets remain supported internally

**Normative basis:** V2 is not a secrets manager, but dependency Compose may use secrets.

### Situation / fixture

Dependency Compose defines secret `db-password` and mounts it into `db`; do not put a Builder-level `secrets` field in JSON.

### Trigger

Compile integrated execution.

### Expected result

Compose-owned secret usage is preserved and namespaced as needed.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency Compose defines secret `db-password` and mounts it into `db`; do not put a Builder-level `secrets` field in JSON.
3. Compile integrated execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Compilation accepts the Compose secret.
- The generated service points to the correct generated secret.
- Builder JSON contains no first-class secret abstraction.

## DEP-013 — Dependency-owned internal networks are isolated

**Normative basis:** Dependency-owned networks may be namespaced.

### Situation / fixture

Compose bundle defines internal network `backplane` used by `api` and `worker`.

### Trigger

Compile two instances in one mesh.

### Expected result

Builder preserves internal connectivity without causing a raw network-name collision.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Compose bundle defines internal network `backplane` used by `api` and `worker`.
3. Compile two instances in one mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Each instance has isolated network identity where necessary.
- Internal peers remain attached correctly.
- Builder endpoint networking remains reachable as required.

## DEP-014 — Internal depends_on is rewritten

**Normative basis:** Builder rewrites dependency-internal service references.

### Situation / fixture

Compose dependency has `api` with `depends_on: db`; endpoint is owned by `api`.

### Trigger

Compile integrated execution.

### Expected result

The raw internal `depends_on` target is rewritten to the corresponding generated `db` service.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Compose dependency has `api` with `depends_on: db`; endpoint is owned by `api`.
3. Compile integrated execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No stale raw `db` reference points at another dependency instance.
- Condition/options on the original internal edge are preserved unless Builder normatively strengthens a Builder-owned edge.

## DEP-015 — Internal links are rewritten or safely preserved

**Normative basis:** Builder rewrites relevant `links` references consistently.

### Situation / fixture

Compose dependency uses a valid `links` entry from `client` to `server` within the same bundle.

### Trigger

Compile two copies of that dependency in a mesh.

### Expected result

The link remains scoped to the correct namespaced peer, not to another bundle.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Compose dependency uses a valid `links` entry from `client` to `server` within the same bundle.
3. Compile two copies of that dependency in a mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Each client links only to its own server.
- Compilation fails clearly if the specific Compose construct cannot be supported safely rather than cross-wiring.

## DEP-016 — network_mode service reference is scoped when supported

**Normative basis:** Service-scoped network_mode references are among references Builder must rewrite where supported.

### Situation / fixture

Compose dependency contains an auxiliary service using `network_mode: "service:proxy"`; this is not `network_mode: host`.

### Trigger

Compile the dependency.

### Expected result

If supported by Builder’s dependency contract, the service reference is rewritten to the generated `proxy`; otherwise Builder rejects it explicitly rather than leaving an unsafe raw reference.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Compose dependency contains an auxiliary service using `network_mode: "service:proxy"`; this is not `network_mode: host`.
3. Compile the dependency.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No `network_mode: host` is introduced.
- No reference resolves to another dependency instance.

## DEP-017 — volumes_from reference is scoped

**Normative basis:** Builder rewrites dependency-internal `volumes_from`.

### Situation / fixture

Dependency service `debug` uses `volumes_from: [data-owner]`.

### Trigger

Compile two copies of the dependency.

### Expected result

Each generated debug service references only its own generated data-owner.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency service `debug` uses `volumes_from: [data-owner]`.
3. Compile two copies of the dependency.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No raw/global cross-reference remains.
- Source options on `volumes_from` are preserved when valid.

## DEP-018 — Identical raw service names across dependencies do not collide

**Normative basis:** Namespacing is per consuming service/dependency.

### Situation / fixture

Declare `redis-a` and `redis-b`; both Compose files contain services named `redis` and `helper`.

### Trigger

Compile them together in one integrated service.

### Expected result

Both dependency bundles coexist without service-name collision.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Declare `redis-a` and `redis-b`; both Compose files contain services named `redis` and `helper`.
3. Compile them together in one integrated service.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Exactly two distinct generated redis services exist.
- Exactly two distinct helpers exist.
- Each logical endpoint resolves to the correct dependency instance.

## DEP-019 — Identical dependency structures across mesh consumers do not collide

**Normative basis:** Dependency namespacing includes the consuming mesh service scope.

### Situation / fixture

Two top-level mesh services each declare local dependency `db`, whose Compose bundle contains `postgres` and `helper` with the same raw names/resources.

### Trigger

Compile the mesh with neither dependency substituted.

### Expected result

Each consumer receives an isolated local dependency implementation.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Two top-level mesh services each declare local dependency `db`, whose Compose bundle contains `postgres` and `helper` with the same raw names/resources.
3. Compile the mesh with neither dependency substituted.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No service, volume, config, secret, or network name collides across consumers.
- Each consumer’s env endpoint reference resolves to its own local dependency.

## DEP-020 — Generated Compose names are not a user contract

**Normative basis:** Generated names are Builder implementation details.

### Situation / fixture

Create a valid dependency and record generated service names from one compilation.

### Trigger

Change an unrelated fixture detail that may legitimately affect private generated names while keeping logical Builder paths unchanged.

### Expected result

Logical endpoint references remain stable even if generated Compose names change.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create a valid dependency and record generated service names from one compilation.
3. Change an unrelated fixture detail that may legitimately affect private generated names while keeping logical Builder paths unchanged.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Tests/configuration need not hardcode generated names.
- Resolved endpoint values point at the currently generated identity.

## DEP-021 — Host ports inside dependency Compose are rejected

**Normative basis:** Host publication is controlled only by endpoints/publication.

### Situation / fixture

Put `ports: ["6379:6379"]` on a dependency Compose service while also declaring a valid Builder endpoint.

### Trigger

Compile any stage in which the dependency is materialized.

### Expected result

Builder fails validation; it must not strip, reinterpret, or silently accept the Compose host port.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Put `ports: ["6379:6379"]` on a dependency Compose service while also declaring a valid Builder endpoint.
3. Compile any stage in which the dependency is materialized.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Non-zero failure occurs before runtime.
- Diagnostic identifies dependency Compose service and forbidden `ports`.
- No partial containers start.

## DEP-022 — network_mode host is rejected

**Normative basis:** `network_mode: host` is forbidden in dependency Compose.

### Situation / fixture

Set `network_mode: host` on any dependency Compose service in a materialized bundle.

### Trigger

Compile integrated mode.

### Expected result

Builder rejects the dependency Compose file.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Set `network_mode: host` on any dependency Compose service in a materialized bundle.
3. Compile integrated mode.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error points to the offending service/property.
- Builder does not weaken isolation by allowing the bundle to run.

## DEP-023 — privileged true is rejected

**Normative basis:** `privileged: true` is forbidden.

### Situation / fixture

Set `privileged: true` on an endpoint owner or companion service.

### Trigger

Compile integrated mode.

### Expected result

Builder fails before composition.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Set `privileged: true` on an endpoint owner or companion service.
3. Compile integrated mode.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic names the service and forbidden setting.
- No container starts.

## DEP-024 — Hardcoded container_name is rejected

**Normative basis:** Dependency Compose must not hardcode globally conflicting container names.

### Situation / fixture

Set `container_name: global-redis` in dependency Compose.

### Trigger

Compile an integrated stage.

### Expected result

Builder rejects the hardcoded globally conflicting name instead of trusting it or silently renaming user intent.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Set `container_name: global-redis` in dependency Compose.
3. Compile an integrated stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Failure is actionable and points to `container_name`.
- No collision-prone container is started.

## DEP-025 — Host root filesystem bind mount is rejected

**Normative basis:** Host-root filesystem mounts are forbidden.

### Situation / fixture

Mount `/:/host` from the host root into a dependency service.

### Trigger

Compile integrated mode.

### Expected result

Builder rejects the unsafe host-root bind.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mount `/:/host` from the host root into a dependency service.
3. Compile integrated mode.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error identifies mount source and service.
- A narrower ordinary fixture bind is not conflated with root mount by the test harness.

## DEP-026 — Endpoint owner must exist in effective Compose

**Normative basis:** Endpoint service selection is explicit and non-inferred.

### Situation / fixture

Declare endpoint service `firebase-ui`, but effective dependency Compose only defines `firebase-emulator`.

### Trigger

Compile integrated stage.

### Expected result

Builder fails; it never chooses a similarly named or first service.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Declare endpoint service `firebase-ui`, but effective dependency Compose only defines `firebase-emulator`.
3. Compile integrated stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error contains logical endpoint path and missing service name.
- No endpoint host is synthesized.

## DEP-027 — Many endpoints can share one owner

**Normative basis:** Endpoint count and Compose service count are independent.

### Situation / fixture

Declare firestore/auth/storage endpoints all owned by one `firebase-emulator` service at different ports; give it one healthcheck.

### Trigger

Compile integrated stage.

### Expected result

All endpoints resolve to one owner host with their respective ports.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Declare firestore/auth/storage endpoints all owned by one `firebase-emulator` service at different ports; give it one healthcheck.
3. Compile integrated stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- One owner service is materialized for those endpoints.
- One healthcheck satisfies the owner requirement.
- No duplicate owner service is generated per endpoint.

## DEP-028 — Primary endpoint does not select principal Compose service

**Normative basis:** Dependency primary is not a principal-service selector.

### Situation / fixture

Dependency has primary `api` on service `api`, secondary `metrics` on service `metrics`.

### Trigger

Compile and inspect readiness/lifecycle.

### Expected result

Both endpoint-owner services participate in dependency readiness; primary only marks canonical endpoint metadata.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency has primary `api` on service `api`, secondary `metrics` on service `metrics`.
3. Compile and inspect readiness/lifecycle.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- App has health edges to both owners.
- Changing which endpoint is primary does not eliminate the other owner’s health requirement.

## DEP-029 — Auxiliary service gets no additional Builder health requirement

**Normative basis:** Auxiliary non-endpoint services are governed by dependency Compose lifecycle.

### Situation / fixture

Bundle contains healthy endpoint owner `api` plus helper `migrate` without a healthcheck and no Builder endpoint.

### Trigger

Compile integrated mode.

### Expected result

Builder does not reject merely because `migrate` lacks a Builder healthcheck, assuming its own Compose lifecycle is otherwise valid.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Bundle contains healthy endpoint owner `api` plus helper `migrate` without a healthcheck and no Builder endpoint.
3. Compile integrated mode.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Endpoint-owner health is required.
- Helper healthcheck is not newly required by Builder.

## DEP-030 — Stage compose replacement replaces atomic implementation

**Normative basis:** Stage compose is scalar replacement of the atomic implementation.

### Situation / fixture

Base dependency `search` points to Compose bundle A; `e2e.dependencies.search.compose` points to bundle B with compatible effective endpoints.

### Trigger

Compile prod and E2E separately.

### Expected result

Prod uses bundle A; E2E uses bundle B as the complete local implementation.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base dependency `search` points to Compose bundle A; `e2e.dependencies.search.compose` points to bundle B with compatible effective endpoints.
3. Compile prod and E2E separately.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No services/resources unique to A leak into E2E.
- No services/resources unique to B appear in prod.
- Effective endpoint owner validation is performed against the selected bundle.

## DEP-031 — Mesh substitution suppresses every local Compose service

**Normative basis:** Substitution suppresses local implementation atomically.

### Situation / fixture

Consumer dependency bundle has endpoint owner `mock-api` plus helpers `db` and `seed`; mesh binds the logical dependency to top-level provider `real-api`.

### Trigger

Compile the mesh.

### Expected result

None of the local dependency services are materialized.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer dependency bundle has endpoint owner `mock-api` plus helpers `db` and `seed`; mesh binds the logical dependency to top-level provider `real-api`.
3. Compile the mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- `mock-api`, `db`, and `seed` local instances are absent.
- Consumer endpoint references resolve through provider app endpoints.
- Consumer lifecycle points at provider app health.

## DEP-032 — Substitution suppresses dependency-owned volumes

**Normative basis:** Substitution suppresses all local dependency resources.

### Situation / fixture

Local default bundle declares persistent volume `mock-data`; substitute the dependency with a top-level provider.

### Trigger

Compile mesh.

### Expected result

The local volume is absent because no local bundle component is materialized.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Local default bundle declares persistent volume `mock-data`; substitute the dependency with a top-level provider.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No orphan `mock-data`-derived generated volume exists.
- Provider-owned resources are unaffected.

## DEP-033 — Substitution suppresses configs, secrets, and internal networks

**Normative basis:** Local implementation/resources are suppressed atomically.

### Situation / fixture

Local dependency bundle declares one config, one Compose secret, and one internal network, then bind the logical slot to a provider.

### Trigger

Compile the mesh.

### Expected result

All resources belonging solely to the suppressed local bundle are omitted.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Local dependency bundle declares one config, one Compose secret, and one internal network, then bind the logical slot to a provider.
3. Compile the mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No generated local config/secret/network remains.
- No stale service references to suppressed objects remain.

## DEP-034 — Unsubstituted dependencies remain local in mesh

**Normative basis:** Substitution is per logical dependency slot.

### Situation / fixture

A mesh consumer has dependencies `backend-mock` and `redis`; mesh substitutes only `backend-mock`.

### Trigger

Compile mesh integrated stage.

### Expected result

`backend-mock` local bundle is suppressed while `redis` still materializes normally.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. A mesh consumer has dependencies `backend-mock` and `redis`; mesh substitutes only `backend-mock`.
3. Compile mesh integrated stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Redis owner/helper/resources remain.
- No blanket suppression is applied to all consumer dependencies.

## DEP-035 — Inert dependency cannot be published

**Normative basis:** Only endpoints of materialized local dependencies can be published.

### Situation / fixture

Consumer declares dependency `tools` with Compose file but no endpoints; mesh `publish` attempts `dependencies.tools.endpoints.ui`.

### Trigger

Compile mesh.

### Expected result

Builder fails because there is no effective endpoint/materialized local dependency to publish.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer declares dependency `tools` with Compose file but no endpoints; mesh `publish` attempts `dependencies.tools.endpoints.ui`.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error points to publish target and missing/inert endpoint.
- Dependency remains unmaterialized.

## DEP-036 — dependsOn cannot force inert dependency materialization

**Normative basis:** A dependsOn target must itself be materialized.

### Situation / fixture

Dependency `worker` has a valid endpoint and declares `dependsOn: ["dependencies.seed"]`; `seed` exists but has no effective endpoints.

### Trigger

Compile integrated stage.

### Expected result

Builder fails rather than materializing `seed` merely because another dependency depends on it.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency `worker` has a valid endpoint and declares `dependsOn: ["dependencies.seed"]`; `seed` exists but has no effective endpoints.
3. Compile integrated stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error identifies the unmaterialized/inert target.
- No seed services are emitted.

## DEP-037 — Stage-added endpoints can activate an inert dependency

**Normative basis:** Materialization uses effective active-stage endpoints.

### Situation / fixture

Base dependency has valid Compose file but no endpoints; dev stage adds a complete endpoint with service, port, primary, and valid owner healthcheck.

### Trigger

Compile prod and dev --full.

### Expected result

Dependency is inert in prod but materializes in dev --full because dev effective endpoints are non-empty.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base dependency has valid Compose file but no endpoints; dev stage adds a complete endpoint with service, port, primary, and valid owner healthcheck.
3. Compile prod and dev --full.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Prod emits no bundle.
- Dev --full emits the complete bundle.
- Dev app gains owner health dependency.

## DEP-038 — Stage can change endpoint owner if effective bundle supports it

**Normative basis:** Endpoint objects deep-merge and effective ownership drives resolution/readiness.

### Situation / fixture

Base endpoint `http` points to service `mock`; E2E overlay changes its `service` to `wiremock`; effective E2E Compose contains both with required healthchecks.

### Trigger

Compile base prod and E2E.

### Expected result

Each stage resolves the endpoint to its effective owner.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base endpoint `http` points to service `mock`; E2E overlay changes its `service` to `wiremock`; effective E2E Compose contains both with required healthchecks.
3. Compile base prod and E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Prod network host maps to `mock` instance.
- E2E maps to `wiremock` instance.
- Readiness follows the effective owner in each stage.

## DEP-039 — Endpoint port binds to the declared owner service

**Normative basis:** Endpoint `service` and `port` together define the endpoint surface.

### Situation / fixture

Multi-service dependency has `api` service listening at logical endpoint port 7000 and unrelated `helper`; endpoint declares service `api`, port 7000, publicPort AUTO.

### Trigger

Compile standalone integrated execution.

### Expected result

Network/public mapping is applied to the endpoint owner, never to the first or helper service.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Multi-service dependency has `api` service listening at logical endpoint port 7000 and unrelated `helper`; endpoint declares service `api`, port 7000, publicPort AUTO.
3. Compile standalone integrated execution.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Generated host mapping targets owner container port 7000.
- Resolved network host corresponds to `api`.
- Helper receives no endpoint mapping.

## DEP-040 — Broken internal Compose reference fails rather than cross-wiring

**Normative basis:** Namespacing must preserve dependency-module boundaries.

### Situation / fixture

Dependency Compose has `api.depends_on: missing-db`, with another dependency elsewhere that happens to have raw service `missing-db`.

### Trigger

Compile both dependencies in one composition.

### Expected result

Builder must not resolve the broken local reference against the other dependency; validation/composition fails.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency Compose has `api.depends_on: missing-db`, with another dependency elsewhere that happens to have raw service `missing-db`.
3. Compile both dependencies in one composition.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No cross-dependency accidental edge is generated.
- Diagnostic identifies the source dependency/service/reference.
