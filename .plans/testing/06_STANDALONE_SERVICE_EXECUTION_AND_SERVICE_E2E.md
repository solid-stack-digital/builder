# Standalone Service Execution and Service-Level E2E

> Builder V2 conformance test conditions. These scenarios are derived from the final V2 specification and are intended to serve as acceptance criteria for an implementation that does not yet exist.

## Scope

Command/stage semantics for dev, dev --full, prod, test-unit, test-e2e, and aggregate test; standalone publication; service-level black-box tester networking, readiness, exit-code handling, and stage isolation.

## Test execution convention

Use the lowest test layer that can prove the invariant:

- **schema/config unit test** for JSON shape, field type, identifier, and unsupported-field validation;
- **compiler unit/integration test** for overlays, references, substitution, publication, namespacing, lifecycle graphs, port allocation, and generated Compose;
- **Docker/Compose integration test** for real health transitions, DNS reachability, environment propagation, host publication, and resource behavior;
- **CLI/E2E test** for command sequencing, exit-code propagation, cleanup, and black-box tester semantics.

A scenario passes only when both its positive behavior and its stated non-effects are verified.

## Scenario count

**30 scenarios**

## SVC-001 — Plain dev is isolated

**Normative basis:** Standalone plain dev is isolated.

### Situation / fixture

Build a service with one app endpoint and two valid local dependencies.

### Trigger

Run/compile `builder service up dev` without `--full`.

### Expected result

App uses dev target/runtime stage with `INFRA_MODE=isolated`; local dependencies are not materialized.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Build a service with one app endpoint and two valid local dependencies.
3. Run/compile `builder service up dev` without `--full`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- App target is dev.
- `EXEC_MODE=dev`.
- `INFRA_MODE=isolated`.
- No local dependency services/resources run.

## SVC-002 — Dev --full is integrated

**Normative basis:** The --full switch changes infrastructure materialization, not runtime stage.

### Situation / fixture

Use the same fixture as SVC-001.

### Trigger

Run/compile `builder service up dev --full`.

### Expected result

App still uses dev target/runtime but local effective dependencies materialize and `INFRA_MODE=integrated`.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Use the same fixture as SVC-001.
3. Run/compile `builder service up dev --full`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- App target remains dev.
- All endpoint-bearing dependencies materialize atomically.
- App receives owner health gates.

## SVC-003 — Standalone prod is integrated

**Normative basis:** Prod is an integrated standalone composition.

### Situation / fixture

Create valid prod target/healthcheck and local dependencies.

### Trigger

Run/compile `builder service up prod`.

### Expected result

Application uses prod target/runtime and integrated infrastructure.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create valid prod target/healthcheck and local dependencies.
3. Run/compile `builder service up prod`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Target=prod.
- `EXEC_MODE=prod`.
- `INFRA_MODE=integrated`.
- Local effective dependencies materialize.

## SVC-004 — Standalone test-unit is isolated finite test execution

**Normative basis:** Unit testing uses isolated test mode.

### Situation / fixture

Dockerfile `test` target writes observed env then exits 0; service has dependencies.

### Trigger

Run `builder service up test-unit`.

### Expected result

Builder runs the test target with test runtime configuration and isolated infrastructure.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dockerfile `test` target writes observed env then exits 0; service has dependencies.
3. Run `builder service up test-unit`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Target=test.
- `EXEC_MODE=test`.
- `INFRA_MODE=isolated`.
- Dependencies do not run.
- Command exit status is the unit-test result.

## SVC-005 — Standalone test-e2e splits app and tester targets

**Normative basis:** E2E runtime stage and image target are separate.

### Situation / fixture

Dockerfile includes valid prod runtime and finite test-e2e target; E2E app config has an integrated mock dependency.

### Trigger

Run `builder service up test-e2e`.

### Expected result

App runs prod target with runtime `e2e`; tester runs test-e2e target; dependencies materialize.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dockerfile includes valid prod runtime and finite test-e2e target; E2E app config has an integrated mock dependency.
3. Run `builder service up test-e2e`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- App build target=prod.
- App `EXEC_MODE=e2e`.
- App `INFRA_MODE=integrated`.
- Tester target=test-e2e.
- Tester is finite.

## SVC-006 — Service up test orchestrates unit then E2E

**Normative basis:** The aggregate test command is ordered orchestration.

### Situation / fixture

Instrument test and test-e2e targets to append ordered markers.

### Trigger

Run `builder service up test` with both phases passing.

### Expected result

Builder runs isolated/unit stage first, then service E2E.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Instrument test and test-e2e targets to append ordered markers.
3. Run `builder service up test` with both phases passing.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Unit marker precedes E2E marker.
- Unit phase uses isolated infra.
- E2E phase uses integrated infra.
- Overall exit is success only after both pass.

## SVC-007 — Unit failure aborts aggregate E2E

**Normative basis:** Aggregate test stops after failed unit stage.

### Situation / fixture

Make Dockerfile test target exit nonzero; test-e2e target would create a marker if launched.

### Trigger

Run `builder service up test`.

### Expected result

Overall command fails after unit phase and does not run E2E.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Make Dockerfile test target exit nonzero; test-e2e target would create a marker if launched.
3. Run `builder service up test`.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Nonzero status propagates.
- E2E marker is absent.
- E2E dependencies/tester are never materialized.

## SVC-008 — E2E failure propagates after successful unit phase

**Normative basis:** Tester exit code is the service E2E result.

### Situation / fixture

Unit target exits 0; test-e2e runner exits an intentional code after app is healthy.

### Trigger

Run aggregate test.

### Expected result

Unit succeeds, E2E runs, and overall command fails according to E2E result.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Unit target exits 0; test-e2e runner exits an intentional code after app is healthy.
3. Run aggregate test.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Both phase markers exist in order.
- Final command is nonzero.
- Failure is attributed to E2E runner.

## SVC-009 — Standalone fixed app publicPort is published automatically

**Normative basis:** Standalone publicPort is effective publication.

### Situation / fixture

App endpoint `http` has fixed `publicPort: 31801`, primary and scheme.

### Trigger

Compile/run standalone dev or prod where app endpoint exists.

### Expected result

Host mapping is created without any mesh publish list.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. App endpoint `http` has fixed `publicPort: 31801`, primary and scheme.
3. Compile/run standalone dev or prod where app endpoint exists.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Host port 31801 maps to app endpoint container port.
- public_port=31801.
- public_host=127.0.0.1.

## SVC-010 — Standalone AUTO app publicPort is allocated

**Normative basis:** AUTO publication is stable when possible.

### Situation / fixture

App primary endpoint has `publicPort:"AUTO"`.

### Trigger

Compile twice with same logical endpoint and available cached port.

### Expected result

Builder assigns a concrete available port and preferentially reuses it on the second compile.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. App primary endpoint has `publicPort:"AUTO"`.
3. Compile twice with same logical endpoint and available cached port.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- public_port is numeric.
- Mapping targets declared container port.
- Stable cache behavior is observed while port remains available.

## SVC-011 — Standalone endpoint without publicPort stays private

**Normative basis:** Omitted publicPort means no host publication.

### Situation / fixture

App endpoint has port/scheme/primary but no publicPort.

### Trigger

Compile standalone prod.

### Expected result

Network properties exist, but no host mapping or public properties are available.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. App endpoint has port/scheme/primary but no publicPort.
3. Compile standalone prod.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No host port mapping for endpoint.
- network_* resolves.
- public_* reference would fail.

## SVC-012 — Standalone materialized dependency fixed publicPort publishes owner

**Normative basis:** Materialized standalone dependency endpoints with publicPort publish automatically.

### Situation / fixture

Dependency endpoint has fixed publicPort and valid owner healthcheck.

### Trigger

Compile/run standalone integrated mode.

### Expected result

Builder maps that host port to the endpoint-owning Compose service.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency endpoint has fixed publicPort and valid owner healthcheck.
3. Compile/run standalone integrated mode.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Mapping lands on correct owner/service port.
- Companion services get no mapping unless they own other published endpoints.

## SVC-013 — Standalone dependency AUTO publicPort allocates

**Normative basis:** AUTO applies to standalone dependency publication.

### Situation / fixture

Materialized dependency endpoint declares publicPort AUTO.

### Trigger

Compile integrated mode.

### Expected result

Builder allocates host port for the owner endpoint and resolves public properties.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Materialized dependency endpoint declares publicPort AUTO.
3. Compile integrated mode.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Concrete public port appears.
- Endpoint public_url includes declared scheme.
- Mapping is not attached to helper service.

## SVC-014 — Inert dependency never publishes

**Normative basis:** Endpoint-less dependencies are inert regardless of Compose internals.

### Situation / fixture

Dependency has Compose implementation but no endpoints; its Compose service itself exposes/listens internally.

### Trigger

Compile integrated standalone mode.

### Expected result

No materialization or host publication occurs.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency has Compose implementation but no endpoints; its Compose service itself exposes/listens internally.
3. Compile integrated standalone mode.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No dependency service.
- No host mapping.
- No public reference surface.

## SVC-015 — Isolated stages do not allocate dependency AUTO ports

**Normative basis:** Only effective publication participates in allocation.

### Situation / fixture

Dependency endpoint has publicPort AUTO but plain dev/test-unit uses isolated infra.

### Trigger

Compile isolated stage and inspect `.builder` state/compiled model.

### Expected result

The non-materialized endpoint does not need an effective host allocation for that execution.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Dependency endpoint has publicPort AUTO but plain dev/test-unit uses isolated infra.
3. Compile isolated stage and inspect `.builder` state/compiled model.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No host mapping.
- No resolved public_* value for an unavailable materialized endpoint.
- No collision is raised solely from the dormant dependency.

## SVC-016 — Service tester can consume app public_url

**Normative basis:** Service tester is host-networked and uses public endpoints.

### Situation / fixture

App E2E endpoint has publicPort AUTO and scheme http; tester.env `APP_URL` references its public_url.

### Trigger

Run service test-e2e.

### Expected result

Builder resolves APP_URL to host-reachable `http://127.0.0.1:<allocated>`.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. App E2E endpoint has publicPort AUTO and scheme http; tester.env `APP_URL` references its public_url.
3. Run service test-e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Tester receives concrete URL.
- Tester can make real black-box HTTP request.
- No Docker-internal host is exposed to tester.

## SVC-017 — Service tester can consume published dependency public_url

**Normative basis:** Black-box tester may consume effectively published dependency endpoints.

### Situation / fixture

E2E dependency `mailpit` has HTTP endpoint publicPort AUTO; tester.env references its public_url.

### Trigger

Run service test-e2e.

### Expected result

Mailpit materializes and tester gets a host-reachable URL.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. E2E dependency `mailpit` has HTTP endpoint publicPort AUTO; tester.env references its public_url.
3. Run service test-e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Tester can query the endpoint via 127.0.0.1.
- The app may simultaneously use mailpit network_* internally.

## SVC-018 — Service tester network_url is rejected

**Normative basis:** network_* properties are forbidden in tester env.

### Situation / fixture

Set tester.env APP_URL to `${app.endpoints.http.network_url}`.

### Trigger

Compile service E2E.

### Expected result

Builder fails before running tests because host-networked tester may not rely on Docker-internal endpoint references.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Set tester.env APP_URL to `${app.endpoints.http.network_url}`.
3. Compile service E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error identifies tester.env key/reference.
- No tester starts.

## SVC-019 — All four network_* tester properties are rejected

**Normative basis:** Host-networked tester restriction applies to every network_* property.

### Situation / fixture

Parameterize tester.env across network_host, network_port, network_address, network_url for app and dependency endpoints.

### Trigger

Compile each variant.

### Expected result

Every variant fails consistently.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Parameterize tester.env across network_host, network_port, network_address, network_url for app and dependency endpoints.
3. Compile each variant.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Four property variants all fail.
- Failure is semantic even where property could be resolved for app containers.

## SVC-020 — Tester public reference requires effective E2E publication

**Normative basis:** public_* only exists for effectively published endpoints.

### Situation / fixture

Tester references app public_port but endpoint omits publicPort in effective E2E config.

### Trigger

Compile service E2E.

### Expected result

Builder rejects unavailable public property rather than passing blank/undefined env.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Tester references app public_port but endpoint omits publicPort in effective E2E config.
3. Compile service E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic says endpoint is not effectively published.
- No implicit publicPort is invented.

## SVC-021 — Service tester comes from the same application Dockerfile

**Normative basis:** build.json tester config contains only env.

### Situation / fixture

Set build.json dockerfile to `.docker/Dockerfile` with unique marker in test-e2e stage.

### Trigger

Run service E2E.

### Expected result

Builder builds tester from that Dockerfile test-e2e target; no tester path/dockerfile config exists.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Set build.json dockerfile to `.docker/Dockerfile` with unique marker in test-e2e stage.
3. Run service E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Marker proves selected test-e2e target.
- No second tester Dockerfile is required.

## SVC-022 — Tester is absent outside service E2E

**Normative basis:** Service tester exists only during service-level E2E.

### Situation / fixture

Define tester.env and a test-e2e target with an obvious side effect.

### Trigger

Run dev, dev --full, prod, and test-unit separately.

### Expected result

Tester never materializes in those executions.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Define tester.env and a test-e2e target with an obvious side effect.
3. Run dev, dev --full, prod, and test-unit separately.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No tester service/container.
- No test-e2e marker.
- tester.env has no effect on app runtime.

## SVC-023 — E2E materializes integrated dependencies

**Normative basis:** E2E is an integrated runtime stage.

### Situation / fixture

Create base redis and E2E-only mailpit dependencies with valid endpoints.

### Trigger

Run service test-e2e.

### Expected result

Both base and E2E effective dependencies materialize.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create base redis and E2E-only mailpit dependencies with valid endpoints.
3. Run service test-e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Redis and mailpit bundles are present.
- App waits for their endpoint owners.
- `INFRA_MODE=integrated`.

## SVC-024 — E2E-only dependency does not leak into prod

**Normative basis:** Stage-added dependencies exist only in their active stage.

### Situation / fixture

Define mailpit only under build.json e2e.dependencies.

### Trigger

Compile/run prod.

### Expected result

Prod composition has no mailpit.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Define mailpit only under build.json e2e.dependencies.
3. Compile/run prod.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No mailpit services/resources/ports.
- Prod env cannot resolve an E2E-only dependency reference if one is improperly declared.

## SVC-025 — Prod-only configuration does not leak into E2E

**Normative basis:** E2E image target selection does not imply prod-stage inheritance.

### Situation / fixture

Set prod app env `ONLY_PROD=yes` and prod-only dependency; set e2e distinct env.

### Trigger

Compile service E2E.

### Expected result

E2E uses its own overlay and does not inherit prod runtime config simply because app image target is prod.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Set prod app env `ONLY_PROD=yes` and prod-only dependency; set e2e distinct env.
3. Compile service E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- ONLY_PROD absent unless also declared in E2E/base.
- Prod-only dependency absent from E2E effective composition.
- E2E env is present.

## SVC-026 — Tester exit zero yields E2E success

**Normative basis:** Selected tester exit code defines result.

### Situation / fixture

Healthy app/dependencies; test-e2e target validates endpoint then exits 0.

### Trigger

Run service test-e2e.

### Expected result

Builder returns success after finite tester exits 0.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Healthy app/dependencies; test-e2e target validates endpoint then exits 0.
3. Run service test-e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Exit status 0.
- App was healthy before tester started.
- Runner does not become a long-lived daemon.

## SVC-027 — Tester nonzero exit yields E2E failure

**Normative basis:** Tester command result is authoritative.

### Situation / fixture

Healthy app; test-e2e target intentionally exits 23.

### Trigger

Run service E2E.

### Expected result

Builder reports failed E2E and preserves useful tester diagnostics.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Healthy app; test-e2e target intentionally exits 23.
3. Run service E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Overall nonzero status.
- Tester exit/result is visible.
- Builder does not treat app health as test success.

## SVC-028 — Tester waits on health rather than arbitrary sleep

**Normative basis:** Service E2E is health-gated.

### Situation / fixture

App readiness delay is randomized within a bounded range; tester immediately fails if endpoint unavailable.

### Trigger

Run repeated E2E executions.

### Expected result

All runs start tester based on health transition, eliminating timing-race dependence on fixed sleeps.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. App readiness delay is randomized within a bounded range; tester immediately fails if endpoint unavailable.
3. Run repeated E2E executions.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Tester start follows app healthy event each run.
- No flaky early-start failures.

## SVC-029 — Standalone simultaneous fixed-port collision fails

**Normative basis:** Fixed effective publications share the active composition host namespace.

### Situation / fixture

App endpoint and materialized dependency endpoint both request the same fixed host publicPort in one standalone composition.

### Trigger

Compile integrated standalone mode.

### Expected result

Builder fails instead of silently remapping one endpoint.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. App endpoint and materialized dependency endpoint both request the same fixed host publicPort in one standalone composition.
3. Compile integrated standalone mode.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error names both logical endpoint paths.
- No partial host mapping is started.

## SVC-030 — Separate standalone projects may independently use same fixed host intent

**Normative basis:** Host-port conflicts are composition-scoped.

### Situation / fixture

Create two independent service fixtures each declaring publicPort 8080; do not compose/run simultaneously for this configuration-level test.

### Trigger

Compile each standalone project separately.

### Expected result

Each configuration is valid on its own; the V2 mesh-global conflict rule is not a schema prohibition against reusing a port in unrelated projects.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create two independent service fixtures each declaring publicPort 8080; do not compose/run simultaneously for this configuration-level test.
3. Compile each standalone project separately.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Both standalone compilations pass when port availability permits.
- Mesh composition of both published endpoints is tested separately as a conflict.
