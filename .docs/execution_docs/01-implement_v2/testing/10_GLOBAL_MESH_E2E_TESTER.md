# Global Mesh E2E Tester

> Builder V2 conformance test conditions. These scenarios are derived from the final V2 specification and are intended to serve as acceptance criteria for an implementation that does not yet exist.

## Scope

Top-level tester Compose/service validation, selected runner behavior, host-network black-box restrictions, public endpoint references, readiness gating, stage isolation, tester-owned build details, and exit-code semantics.

## Test execution convention

Use the lowest test layer that can prove the invariant:

- **schema/config unit test** for JSON shape, field type, identifier, and unsupported-field validation;
- **compiler unit/integration test** for overlays, references, substitution, publication, namespacing, lifecycle graphs, port allocation, and generated Compose;
- **Docker/Compose integration test** for real health transitions, DNS reachability, environment propagation, host publication, and resource behavior;
- **CLI/E2E test** for command sequencing, exit-code propagation, cleanup, and black-box tester semantics.

A scenario passes only when both its positive behavior and its stated non-effects are verified.

## Scenario count

**30 scenarios**

## TST-001 — Minimal global tester compiles

**Normative basis:** Global tester is configured by compose + service.

### Situation / fixture

Mesh has valid services and tester with `compose:"./e2e/docker-compose.yml"` and `service:"tester"`; Compose defines that finite service.

### Trigger

Compile global E2E.

### Expected result

Builder loads tester Compose and selects the configured runner.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh has valid services and tester with `compose:"./e2e/docker-compose.yml"` and `service:"tester"`; Compose defines that finite service.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Selected tester service exists in generated composition.
- Runner is distinct from application services.

## TST-002 — Global tester compose is required

**Normative basis:** tester.compose is required.

### Situation / fixture

Declare tester with service/env but omit compose.

### Trigger

Validate mesh.

### Expected result

Builder rejects incomplete tester config.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Declare tester with service/env but omit compose.
3. Validate mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic points to tester.compose.
- No tester path fallback.

## TST-003 — Global tester service is required

**Normative basis:** tester.service explicitly identifies runner.

### Situation / fixture

Declare tester.compose but omit tester.service.

### Trigger

Validate mesh.

### Expected result

Builder rejects config.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Declare tester.compose but omit tester.service.
3. Validate mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic points to tester.service.
- No first-service inference.

## TST-004 — Selected tester service must exist

**Normative basis:** Tester service selection is explicit.

### Situation / fixture

Tester Compose defines services helper and runner-x; mesh tester.service is `tester`.

### Trigger

Compile global E2E.

### Expected result

Builder fails rather than selecting a different Compose service.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Tester Compose defines services helper and runner-x; mesh tester.service is `tester`.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error names missing selected service and tester Compose source.

## TST-005 — Malformed tester YAML fails fast

**Normative basis:** Declared files must be valid.

### Situation / fixture

Point tester.compose to syntactically invalid YAML.

### Trigger

Compile global E2E.

### Expected result

Builder reports parse/validation failure before any test runtime.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Point tester.compose to syntactically invalid YAML.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Source file appears in diagnostic.
- No partial tester/app execution caused by malformed tester.

## TST-006 — tester.env is injected only into selected runner

**Normative basis:** tester.env configures selected black-box runner.

### Situation / fixture

Tester Compose has selected `tester` and helper `fixture`; tester.env sets SYSTEM_URL and TOKEN.

### Trigger

Compile/run global E2E.

### Expected result

Configured env is applied to selected runner.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Tester Compose has selected `tester` and helper `fixture`; tester.env sets SYSTEM_URL and TOKEN.
3. Compile/run global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Runner receives both values.
- Builder does not require helper to receive tester env.

## TST-007 — Selected global runner is forced to host networking

**Normative basis:** Global tester is a host-networked black-box client.

### Situation / fixture

Tester Compose runner has ordinary Compose networking or none specified.

### Trigger

Compile global E2E.

### Expected result

Builder forces selected runner into host-network black-box execution.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Tester Compose runner has ordinary Compose networking or none specified.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Generated selected runner uses host networking semantics.
- Runner reaches 127.0.0.1 published endpoints.

## TST-008 — Global tester rejects network_host

**Normative basis:** Global tester may not rely on Docker-internal network properties.

### Situation / fixture

tester.env contains `${gateway.app.endpoints.http.network_host}`.

### Trigger

Compile global E2E.

### Expected result

Builder rejects network_host reference.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. tester.env contains `${gateway.app.endpoints.http.network_host}`.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Failure occurs before tests run.
- Diagnostic names tester env key.

## TST-009 — Global tester rejects network_port

**Normative basis:** All network_* properties are forbidden in tester env.

### Situation / fixture

tester.env references network_port of app/dependency endpoint.

### Trigger

Compile global E2E.

### Expected result

Builder rejects it despite value being numerically resolvable internally.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. tester.env references network_port of app/dependency endpoint.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No raw internal port is injected as tester contract.

## TST-010 — Global tester rejects network_address

**Normative basis:** Host-networked runner uses public_* only.

### Situation / fixture

tester.env references network_address.

### Trigger

Compile global E2E.

### Expected result

Builder rejects host:port Docker-internal address.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. tester.env references network_address.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error is semantic, not connectivity-time.

## TST-011 — Global tester rejects network_url

**Normative basis:** Global tester is black-box and host-reachable only.

### Situation / fixture

tester.env references network_url.

### Trigger

Compile global E2E.

### Expected result

Builder rejects it.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. tester.env references network_url.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No Docker DNS name is passed to runner.

## TST-012 — Published app public_url resolves for tester

**Normative basis:** Tester should consume effectively published public endpoints.

### Situation / fixture

Gateway app endpoint has publicPort AUTO/scheme and gateway mesh publish selects it; tester SYSTEM_URL references public_url.

### Trigger

Compile/run global E2E.

### Expected result

Tester receives concrete host URL and can reach gateway.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Gateway app endpoint has publicPort AUTO/scheme and gateway mesh publish selects it; tester SYSTEM_URL references public_url.
3. Compile/run global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- URL starts http://127.0.0.1:.
- Port equals final allocated publication.

## TST-013 — Unpublished public property reference fails

**Normative basis:** Mesh publish controls effective exposure.

### Situation / fixture

Endpoint has build publicPort but mesh omits publish; tester references public_port/public_url.

### Trigger

Compile E2E.

### Expected result

Builder fails because endpoint is not effectively published.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Endpoint has build publicPort but mesh omits publish; tester references public_port/public_url.
3. Compile E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No implicit tester-triggered publication.

## TST-014 — public_url needs scheme; public_address does not

**Normative basis:** URL construction requires scheme.

### Situation / fixture

Publish endpoint with publicPort but no scheme. Parameterize tester ref public_url vs public_address.

### Trigger

Compile each variant.

### Expected result

public_url variant fails missing scheme; public_address succeeds.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Publish endpoint with publicPort but no scheme. Parameterize tester ref public_url vs public_address.
3. Compile each variant.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Property-specific validation is preserved in tester context.

## TST-015 — AUTO is fully allocated before tester env resolution

**Normative basis:** Reference resolution happens after publication and allocation.

### Situation / fixture

Tester references public_url for AUTO-published endpoint.

### Trigger

Compile E2E.

### Expected result

Injected env contains final numeric port, never AUTO or unresolved token.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Tester references public_url for AUTO-published endpoint.
3. Compile E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Resolved env value is concrete.

## TST-016 — Stage-specific tester overlay is forbidden

**Normative basis:** Global tester has no stage-specific overlay.

### Situation / fixture

Add dev.tester, prod.tester, test.tester, or e2e.tester.

### Trigger

Validate each.

### Expected result

Builder rejects stage tester definitions.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Add dev.tester, prod.tester, test.tester, or e2e.tester.
3. Validate each.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Only top-level tester is permitted.

## TST-017 — Legacy tester.path is rejected

**Normative basis:** V2 rejects tester.path.

### Situation / fixture

Use V1-style tester.path.

### Trigger

Validate mesh.

### Expected result

Builder fails with unsupported legacy field.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Use V1-style tester.path.
3. Validate mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No translation to tester.compose.

## TST-018 — Legacy tester.dockerfile is rejected

**Normative basis:** No tester.dockerfile field in V2.

### Situation / fixture

Use tester.dockerfile alongside otherwise valid tester config.

### Trigger

Validate mesh.

### Expected result

Builder rejects it.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Use tester.dockerfile alongside otherwise valid tester config.
3. Validate mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Tester Compose owns build/Dockerfile details.

## TST-019 — Legacy tester policy/envOverrides are rejected

**Normative basis:** Removed tester fields are fail-fast.

### Situation / fixture

Parameterize tester.policy and tester.envOverrides.

### Trigger

Validate mesh.

### Expected result

Both are rejected; use tester.env and Compose-owned details.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Parameterize tester.policy and tester.envOverrides.
3. Validate mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No compatibility translation.

## TST-020 — Global tester does not exist during mesh dev/prod

**Normative basis:** Global tester exists only during global E2E.

### Situation / fixture

Configure a tester whose runner writes a visible marker.

### Trigger

Run mesh dev and mesh prod.

### Expected result

Tester is absent; marker not produced.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Configure a tester whose runner writes a visible marker.
3. Run mesh dev and mesh prod.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No tester container.
- Applications run normally.

## TST-021 — Tester waits for all effective top-level apps

**Normative basis:** Global runner is health-gated on effective top-level application services.

### Situation / fixture

Three base top-level apps become healthy at controlled times.

### Trigger

Run global E2E and record tester start.

### Expected result

Runner begins after all effective app services meet health readiness.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Three base top-level apps become healthy at controlled times.
3. Run global E2E and record tester start.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Tester timestamp after last required app healthy timestamp.

## TST-022 — Stage-added app joins tester readiness set

**Normative basis:** Readiness set uses effective active-stage services.

### Situation / fixture

E2E overlay adds fake-payments service with delayed health.

### Trigger

Run global E2E.

### Expected result

Tester waits for the E2E-only top-level app as part of effective composition.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. E2E overlay adds fake-payments service with delayed health.
3. Run global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Runner does not start after only base apps are healthy.

## TST-023 — Tester runner exit code is global E2E result

**Normative basis:** Selected runner is exit-code source.

### Situation / fixture

All apps healthy; selected tester exits a controlled nonzero code.

### Trigger

Run global E2E.

### Expected result

Builder reports test failure based on selected runner.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. All apps healthy; selected tester exits a controlled nonzero code.
3. Run global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Overall command nonzero.
- App health alone is not success.

## TST-024 — Unselected tester helper is not exit-code source

**Normative basis:** tester.service chooses finite runner.

### Situation / fixture

Tester Compose includes helper that remains running or exits nonzero independently; selected finite runner exits 0 after test.

### Trigger

Run global E2E.

### Expected result

Global test result follows selected runner, subject to Compose materialization validity.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Tester Compose includes helper that remains running or exits nonzero independently; selected finite runner exits 0 after test.
3. Run global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Selected runner identity determines result.
- Builder does not guess helper as test process.

## TST-025 — Tester env can reference multiple published services

**Normative basis:** Tester may consume any effectively published mesh endpoint.

### Situation / fixture

Publish gateway HTTP and observability HTTP; tester env has SYSTEM_URL and METRICS_URL public URLs.

### Trigger

Compile/run E2E.

### Expected result

Both resolve to host endpoints and are reachable.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Publish gateway HTTP and observability HTTP; tester env has SYSTEM_URL and METRICS_URL public URLs.
3. Compile/run E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Each value uses correct service/port.
- No collision/unresolved ref.

## TST-026 — Tester cannot use private dependency network endpoint

**Normative basis:** Black-box tester restriction applies to effective dependency slot refs too.

### Situation / fixture

Backend local dependency postgres has only network endpoint; tester env references backend.dependencies.postgres...network_address.

### Trigger

Compile global E2E.

### Expected result

Builder rejects reference; test fixture must publish a deliberate public surface if black-box access is required.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Backend local dependency postgres has only network endpoint; tester env references backend.dependencies.postgres...network_address.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No privileged/internal tester exception.

## TST-027 — Tester Compose owns its build implementation

**Normative basis:** Tester Compose owns build details.

### Situation / fixture

Tester Compose selects runner with `build` pointing to custom Dockerfile/context.

### Trigger

Compile global E2E.

### Expected result

Builder preserves/uses tester Compose build definition while applying runner networking/env/lifecycle requirements.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Tester Compose selects runner with `build` pointing to custom Dockerfile/context.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No mesh tester.dockerfile required.
- Relative paths resolve within tester Compose project context.

## TST-028 — Tester env values are string-only

**Normative basis:** Every Builder-managed env map is Record<string,string>.

### Situation / fixture

Set tester.env RETRIES to number, ENABLED boolean, null, array, or object in parameterized cases.

### Trigger

Validate mesh.

### Expected result

Every non-string value is rejected.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Set tester.env RETRIES to number, ENABLED boolean, null, array, or object in parameterized cases.
3. Validate mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No coercion to string.
- Diagnostic identifies env key/type.

## TST-029 — E2E-stage-only published endpoint can be referenced by top-level tester

**Normative basis:** Resolution occurs after active E2E overlay/publication.

### Situation / fixture

Service build e2e adds metrics publicPort; mesh e2e publishes metrics; top-level tester env references metrics public_url.

### Trigger

Compile global E2E.

### Expected result

Reference succeeds because tester is evaluated in E2E effective composition.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Service build e2e adds metrics publicPort; mesh e2e publishes metrics; top-level tester env references metrics public_url.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Same reference would not be generally available in non-E2E composition, where tester does not run.

## TST-030 — Tester failure leaves no semantic configuration mutation

**Normative basis:** Builder orchestration is derived from configuration, not mutated by tester result.

### Situation / fixture

Run E2E with tester intentionally failing, then fix only tester command/input and compile/run again.

### Trigger

Compare effective generated app/dependency composition before and after.

### Expected result

A tester failure does not rewrite build.json/mesh.json state or provider/publication semantics.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Run E2E with tester intentionally failing, then fix only tester command/input and compile/run again.
3. Compare effective generated app/dependency composition before and after.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Second compile is deterministic from same config/cache/port availability.
- No stale lifecycle/provider mutation from failed run.
