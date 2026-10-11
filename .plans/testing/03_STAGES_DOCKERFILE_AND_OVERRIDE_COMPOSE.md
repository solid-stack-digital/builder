# 03 — Stage Overlay Semantics, Dockerfile Contract, and override-compose

> Builder V2 conformance test conditions. These scenarios are derived from the final V2 specification and are intended to serve as acceptance criteria for an implementation that does not yet exist.

## Scope

Validates non-destructive stage overlays, deep/scalar/union merge behavior, stage-only declarations, execution-stage selection, the E2E prod-image/e2e-runtime split, required Dockerfile targets and readiness contract, and strict limitations on stage override Compose.

## Test execution convention

Use the lowest test layer that can prove the invariant:

- **schema/config unit test** for JSON shape, field type, identifier, and unsupported-field validation;
- **compiler unit/integration test** for overlays, references, substitution, publication, namespacing, lifecycle graphs, port allocation, and generated Compose;
- **Docker/Compose integration test** for real health transitions, DNS reachability, environment propagation, host publication, and resource behavior;
- **CLI/E2E test** for command sequencing, exit-code propagation, cleanup, and black-box tester semantics.

A scenario passes only when both its positive behavior and its stated non-effects are verified.

## Scenario count

**39 scenarios**

## STG-001 — App env deep merge

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Base app env A=1,B=1; dev app env B=2,C=2.

### Trigger

Compile dev.

### Expected result

Effective app env retains A, replaces B, adds C before higher layers.

### How to test

Inspect normalized stage model.

### Required assertions

- Omitted base keys survive.

## STG-002 — Endpoint scalar overlay

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Base http endpoint has port 3000, publicPort AUTO, primary true, scheme http; dev only sets publicPort 3001.

### Trigger

Compile dev.

### Expected result

Effective endpoint keeps port/primary/scheme and replaces publicPort only.

### How to test

Inspect normalized endpoint.

### Required assertions

- Endpoint object is deep-merged, not wholesale replaced.

## STG-003 — Stage-added app endpoint

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

E2E adds `debug` endpoint while base keeps primary http.

### Trigger

Compile e2e and prod.

### Expected result

E2E sees http+debug with one primary; prod sees only http.

### How to test

Compare stage models.

### Required assertions

- Stage-only endpoint does not leak.

## STG-004 — Stage can invalidate primary invariant

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Stage makes second app endpoint primary or unsets sole primary.

### Trigger

Compile stage.

### Expected result

Fail after overlay resolution.

### How to test

Test zero-primary and multiple-primary effective results.

### Required assertions

- Base may remain valid.

## STG-005 — Complete stage-added dependency

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

E2E adds Mailpit with compose and complete endpoint fields.

### Trigger

Compile e2e.

### Expected result

Dependency exists/materializes only in e2e integrated execution.

### How to test

Inspect effective model and topology.

### Required assertions

- Other stages omit it.

## STG-006 — Incomplete stage-added dependency

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

E2E adds endpoint-bearing dependency with no inherited/base compose.

### Trigger

Compile e2e.

### Expected result

Fail effective dependency contract.

### How to test

Capture error.

### Required assertions

- Same partial object may be valid only when overlaying an existing dependency.

## STG-007 — New stage endpoint needs service and port

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Stage adds a new dependency endpoint containing only scheme/publicPort.

### Trigger

Compile.

### Expected result

Fail because no base endpoint exists to supply required service/port.

### How to test

Parameterize missing service, port, both.

### Required assertions

- Existing endpoint modifications may inherit omitted fields.

## STG-008 — Stage dependency env merge

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Base dependency env A=1,B=1; stage sets B=2,C=2.

### Trigger

Compile integrated stage.

### Expected result

Every service in dependency gets A=1,B=2,C=2.

### How to test

Inspect all dependency service env maps.

### Required assertions

- No endpoint-owner-only behavior.

## STG-009 — Stage dependency compose replacement

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Base dependency uses implementation A; e2e sets compose implementation B.

### Trigger

Compile both stages.

### Expected result

Each stage materializes only its selected atomic bundle.

### How to test

Use distinct services/resources to prove no bundle merge.

### Required assertions

- Endpoints validate against selected Compose.

## STG-010 — Build dependsOn union merge

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Base worker depends on redis; e2e adds mailpit and repeats redis.

### Trigger

Compile e2e.

### Expected result

Effective order is base then new stage entry; duplicate removed.

### How to test

Inspect normalized list and graph.

### Required assertions

- Array is not replaced.

## STG-011 — Mesh dependsOn union merge

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Base gateway depends on backend; e2e adds fake-payments and repeats backend.

### Trigger

Compile e2e.

### Expected result

Both effective targets appear once in base-first order.

### How to test

Inspect normalized mesh/Compose.

### Required assertions

- No removal.

## STG-012 — Mesh publish union merge

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Base publishes http; e2e adds metrics and repeats http.

### Trigger

Compile e2e.

### Expected result

Both endpoints are published once, base-first.

### How to test

Inspect publish set/ports.

### Required assertions

- Stage cannot unpublish base entry.

## STG-013 — No generic delete syntax

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Attempt null/delete sentinel to remove inherited endpoint/dependency/service/property.

### Trigger

Validate/compile.

### Expected result

No undocumented deletion semantics; invalid forms fail and ordinary omitted fields inherit.

### How to test

Test common sentinels and nulls.

### Required assertions

- Overlay stays non-destructive.

## STG-014 — Standalone dev is isolated

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Service has valid local dependencies.

### Trigger

Compile/run `builder service up dev`.

### Expected result

Target dev, runtime stage dev, INFRA_MODE isolated, dependencies absent.

### How to test

Inspect env/topology.

### Required assertions

- Dev stage app config still applies.

## STG-015 — Standalone dev --full is integrated

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Same service.

### Trigger

Compile/run `builder service up dev --full`.

### Expected result

Target dev/runtime dev, INFRA_MODE integrated, effective dependencies materialize.

### How to test

Inspect topology/health edges.

### Required assertions

- Only infra materialization differs from plain dev.

## STG-016 — Prod is integrated

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Service has prod overlay and local dependency.

### Trigger

Compile/run prod.

### Expected result

Target/runtime prod, integrated dependencies.

### How to test

Inspect target/env/topology.

### Required assertions

- Dev overlay absent.

## STG-017 — Test-unit is isolated

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Service has test overlay and dependencies.

### Trigger

Run test-unit.

### Expected result

Target/runtime test, INFRA_MODE isolated, local dependencies absent.

### How to test

Inspect generated test composition.

### Required assertions

- No E2E tester.

## STG-018 — Service E2E target/runtime split

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Distinct prod and e2e env markers.

### Trigger

Run test-e2e.

### Expected result

App image uses prod target, runtime stage is e2e, e2e config active.

### How to test

Inspect build target and app env.

### Required assertions

- prod app env not inherited.

## STG-019 — E2E does not inherit .env.prod

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Provide conflicting `.env.prod` and `.env.e2e` markers.

### Trigger

Run E2E.

### Expected result

E2E config uses its own stage inputs; `.env.prod` does not bleed in merely due prod target.

### How to test

Inspect runtime env.

### Required assertions

- Prod command uses prod marker as control.

## STG-020 — E2E does not inherit prod.app.env

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Base, prod, and e2e define distinguishable values.

### Trigger

Run E2E.

### Expected result

Effective runtime uses base+e2e according to precedence, not prod overlay.

### How to test

Inspect env.

### Required assertions

- Prod run differs.

## STG-021 — E2E does not inherit mesh.prod

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Mesh prod and e2e service env markers conflict.

### Trigger

Compile global e2e.

### Expected result

E2E overlay wins/exists independently; prod overlay is not inherited.

### How to test

Inspect env.

### Required assertions

- Production image target remains prod.

## STG-022 — Valid override app environment

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Active override-compose changes only `services.app.environment`.

### Trigger

Compile.

### Expected result

Override env applies at documented precedence.

### How to test

Inspect final env.

### Required assertions

- No extra service created.

## STG-023 — Valid override development volumes

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Dev override adds app bind mounts.

### Trigger

Compile/run dev.

### Expected result

Volumes are accepted as permitted app runtime details.

### How to test

Inspect generated Compose/runtime mounts.

### Required assertions

- Endpoint/lifecycle truth unchanged.

## STG-024 — Valid override build args

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Active override defines app `build.args`.

### Trigger

Build.

### Expected result

Args reach Docker build for selected stage.

### How to test

Use image marker to assert.

### Required assertions

- JSON runtime env is not implicitly copied to build args.

## STG-025 — Override cannot add arbitrary service

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Override adds `services.helper`.

### Trigger

Compile active stage.

### Expected result

Fail validation.

### How to test

Capture error.

### Required assertions

- Stage-only infra belongs in stage dependencies.

## STG-026 — Override cannot publish host ports

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Override adds app `ports`.

### Trigger

Compile.

### Expected result

Fail; Builder endpoints/publication own host exposure.

### How to test

Capture error.

### Required assertions

- No stripping/reinterpretation.

## STG-027 — Override cannot create app depends_on

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Override adds app depends_on.

### Trigger

Compile.

### Expected result

Fail.

### How to test

Capture error.

### Required assertions

- Builder lifecycle remains authoritative.

## STG-028 — Override cannot replace target

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Override sets build.target different from Builder-selected target.

### Trigger

Compile.

### Expected result

Fail.

### How to test

Inspect error.

### Required assertions

- Command/stage owns target selection.

## STG-029 — Override cannot weaken required healthcheck

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Override disables/removes dev/prod healthcheck.

### Trigger

Compile.

### Expected result

Fail readiness contract.

### How to test

Test disable and invalid replacement.

### Required assertions

- No fallback synthesized.

## STG-030 — Required Dockerfile target aliases

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Create fixtures missing dev, test, test-e2e, or prod.

### Trigger

Validate/compile.

### Expected result

Each missing required alias fails.

### How to test

Parameterize missing target.

### Required assertions

- Additional internal build stages are allowed.

## STG-031 — dev foreground CMD required

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Dev target lacks default CMD or backgrounds app then exits.

### Trigger

Validate/run.

### Expected result

Nonconforming dev fails contract/runtime acceptance.

### How to test

Use static contract test plus container lifecycle probe.

### Required assertions

- Container must remain attached to foreground process.

## STG-032 — Finite test targets

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

test/test-e2e targets execute commands that exit 0/1.

### Trigger

Run them.

### Expected result

Builder treats them as finite runners and propagates exit result.

### How to test

Use pass/fail target pairs.

### Required assertions

- Healthcheck is not required for finite runners.

## STG-033 — dev and prod healthchecks required

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Dockerfile variants omit/inherit valid healthcheck.

### Trigger

Compile dev/prod/mesh.

### Expected result

Missing checks fail; valid inherited checks pass.

### How to test

Parameterize direct vs inherited HEALTHCHECK.

### Required assertions

- Builder never synthesizes a check.

## STG-034 — Dockerfile EXPOSE forbidden

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Add `EXPOSE` to otherwise valid app Dockerfile.

### Trigger

Validate.

### Expected result

Fail V2 Dockerfile contract.

### How to test

Static parser/contract test.

### Required assertions

- Endpoint configuration remains Builder-owned.

## STG-035 — Prod artifact isolation

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Compare valid multi-stage prod copying artifacts from builder stage with non-isolated prod carrying build tree/toolchain contrary to retained contract.

### Trigger

Validate Dockerfile contract.

### Expected result

Conforming prod passes; nonconforming fixture fails.

### How to test

Use contract checker and inspect build instructions.

### Required assertions

- Internal stage need not literally be named `builder`.

## STG-036 — Runtime daemonization forbidden

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Dev/prod CMD launches process in background and shell exits.

### Trigger

Run contract/integration test.

### Expected result

Rejected or demonstrably fails acceptance; valid app remains foreground.

### How to test

Observe early container exit.

### Required assertions

- Builder must not mask it with weaker lifecycle behavior.

## STG-037 — Primary port injects Builder PORT

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Primary app endpoint port is 4123.

### Trigger

Compile/run runtime stages.

### Expected result

Builder-owned `PORT=4123` appears.

### How to test

Inspect environment.

### Required assertions

- Secondary endpoint ports do not affect PORT.

## STG-038 — No endpoints means no endpoint-derived PORT

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

App endpoints omitted/empty.

### Trigger

Compile/run.

### Expected result

No Builder endpoint PORT is injected.

### How to test

Inspect env.

### Required assertions

- Required healthcheck must use another valid readiness strategy.

## STG-039 — Effective-stage semantic validation

**Normative basis:** SPECS_V2 §§2.2, 8–11, 17, 26; BUILD_JSON_DOCS §§2, 9–10

### Situation / fixture

Only e2e overlay creates unresolved ref or bad primary count; source schema is otherwise valid.

### Trigger

Compile each stage separately.

### Expected result

E2E fails while unaffected active stages compile.

### How to test

Run all stage compilers independently.

### Required assertions

- Diagnostic names active stage.
