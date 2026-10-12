# Mesh Stage Overlays and Environment Precedence

> Builder V2 conformance test conditions. These scenarios are derived from the final V2 specification and are intended to serve as acceptance criteria for an implementation that does not yet exist.

## Scope

Non-destructive mesh stage overlays, stage-added services/bindings/lifecycle/publication, active-stage validation, the complete app environment precedence stack, Builder-owned environment protection, and separation of E2E runtime configuration from production image targets.

## Test execution convention

Use the lowest test layer that can prove the invariant:

- **schema/config unit test** for JSON shape, field type, identifier, and unsupported-field validation;
- **compiler unit/integration test** for overlays, references, substitution, publication, namespacing, lifecycle graphs, port allocation, and generated Compose;
- **Docker/Compose integration test** for real health transitions, DNS reachability, environment propagation, host publication, and resource behavior;
- **CLI/E2E test** for command sequencing, exit-code propagation, cleanup, and black-box tester semantics.

A scenario passes only when both its positive behavior and its stated non-effects are verified.

## Scenario count

**30 scenarios**

## MEN-001 — Mesh stage may overlay only services

**Normative basis:** Mesh stages overlay services only.

### Situation / fixture

Put `tester`, root-level dependencies, or another non-services key under `dev`/`prod`/`test`/`e2e` stage object.

### Trigger

Validate mesh stage.

### Expected result

Builder rejects unsupported stage children.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Put `tester`, root-level dependencies, or another non-services key under `dev`/`prod`/`test`/`e2e` stage object.
3. Validate mesh stage.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Only `<stage>.services` is accepted.
- Diagnostic identifies exact invalid stage path.

## MEN-002 — Stage service env deep-merges with base env

**Normative basis:** Mesh stage service objects deep-merge.

### Situation / fixture

Base mesh service env has A=base,B=base; dev service env has B=dev,C=dev.

### Trigger

Compile mesh dev.

### Expected result

Effective mesh service env has A=base,B=dev,C=dev before Builder internal layer.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base mesh service env has A=base,B=base; dev service env has B=dev,C=dev.
3. Compile mesh dev.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Omitted base key A survives.
- Stage value B wins.
- New C added.

## MEN-003 — Stage can add a top-level service

**Normative basis:** Stage-only map entries are added non-destructively.

### Situation / fixture

Base contains gateway/backend; e2e.services adds fake-payments with valid path.

### Trigger

Compile prod and e2e.

### Expected result

Service exists only in E2E effective mesh.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base contains gateway/backend; e2e.services adds fake-payments with valid path.
3. Compile prod and e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Prod has no fake-payments.
- E2E loads and validates fake-payments build.json.

## MEN-004 — Stage can replace service path scalar

**Normative basis:** Scalars replace matching base values.

### Situation / fixture

Base backend path is services/backend; dev overlay backend.path points to testing/backend-dev with valid service.

### Trigger

Compile dev and prod.

### Expected result

Dev loads replacement path; prod retains base.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base backend path is services/backend; dev overlay backend.path points to testing/backend-dev with valid service.
3. Compile dev and prod.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Scalar path replacement is stage-local.
- Other omitted service fields inherit base.

## MEN-005 — Stage dependency binding map merges

**Normative basis:** Object/map stage fields deep-merge.

### Situation / fixture

Base service dependencies maps `backend` and `redis-provider`; e2e changes backend provider and adds payments.

### Trigger

Compile e2e.

### Expected result

Unmentioned redis binding remains; backend scalar provider changes; payments entry is added.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base service dependencies maps `backend` and `redis-provider`; e2e changes backend provider and adds payments.
3. Compile e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Effective binding map has all expected keys.

## MEN-006 — Stage provider value replaces base scalar

**Normative basis:** Scalar map values replace.

### Situation / fixture

Base payments slot -> real-payments; e2e same slot -> fake-payments.

### Trigger

Compile e2e.

### Expected result

Effective binding uses fake-payments only.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base payments slot -> real-payments; e2e same slot -> fake-payments.
3. Compile e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No dual provider ambiguity.
- Base remains unchanged in non-E2E stage.

## MEN-007 — Mesh dependsOn arrays union-merge

**Normative basis:** dependsOn is an explicit union array exception.

### Situation / fixture

Base dependsOn frontend; e2e adds fake-payments and repeats frontend.

### Trigger

Compile e2e.

### Expected result

Effective list is frontend then fake-payments with exact duplicate removed.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base dependsOn frontend; e2e adds fake-payments and repeats frontend.
3. Compile e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Base order retained.
- Stage-only target appended in stage order.

## MEN-008 — Mesh publish arrays union-merge

**Normative basis:** publish is an explicit union array exception.

### Situation / fixture

Base publishes app http; e2e publishes app metrics and repeats http.

### Trigger

Compile e2e.

### Expected result

Effective publish list contains base http then stage metrics once.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base publishes app http; e2e publishes app metrics and repeats http.
3. Compile e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No normal array replacement.
- Duplicate exact string removed.

## MEN-009 — Omitted base services survive stage overlay

**Normative basis:** Omitted fields inherit base.

### Situation / fixture

Base services backend/frontend/gateway; dev.services contains only backend env override.

### Trigger

Compile dev.

### Expected result

Frontend and gateway remain effective.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base services backend/frontend/gateway; dev.services contains only backend env override.
3. Compile dev.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Stage overlay is non-destructive.
- No service removal due to omission.

## MEN-010 — Reference to stage-only service fails outside its stage

**Normative basis:** Validation occurs against effective active-stage composition.

### Situation / fixture

Base gateway env references `${fake.app.endpoints.http.network_url}`; fake exists only under e2e.services.

### Trigger

Compile dev.

### Expected result

Builder fails unresolved reference in dev.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base gateway env references `${fake.app.endpoints.http.network_url}`; fake exists only under e2e.services.
3. Compile dev.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No cross-stage visibility.
- Error names active stage and reference.

## MEN-011 — Stage-only service can satisfy same-stage dependsOn

**Normative basis:** Effective stage is normalized before semantic validation.

### Situation / fixture

E2E adds fake-payments and gateway.e2e dependsOn fake-payments.

### Trigger

Compile e2e.

### Expected result

Overlay is applied before lifecycle validation, so target resolves.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. E2E adds fake-payments and gateway.e2e dependsOn fake-payments.
3. Compile e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Generated edge health-gates fake-payments app.

## MEN-012 — Stage-only provider can satisfy same-stage binding

**Normative basis:** Stage additions are effective before substitution validation.

### Situation / fixture

E2E adds provider `fake` and consumer binding slot->fake in same overlay.

### Trigger

Compile e2e.

### Expected result

Binding validates and resolves.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. E2E adds provider `fake` and consumer binding slot->fake in same overlay.
3. Compile e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Local dependency slot suppressed only in E2E.
- Provider edge exists.

## MEN-013 — No stage deletion/removal syntax

**Normative basis:** V2 has no deletion/removal syntax.

### Situation / fixture

Attempt values such as null, false, `_delete`, or empty special marker to remove a base service/map entry.

### Trigger

Validate parameterized variants.

### Expected result

Builder does not interpret undocumented deletion semantics; invalid shapes fail and omission retains base.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Attempt values such as null, false, `_delete`, or empty special marker to remove a base service/map entry.
3. Validate parameterized variants.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No silent destructive behavior.

## MEN-014 — .env.<stage> is lower precedence than base app.env

**Normative basis:** App env precedence starts with stage env file then base app.env.

### Situation / fixture

Create `.env.dev` with VALUE=dotenv and build base app.env VALUE=base.

### Trigger

Compile service/mesh dev while recording effective app env.

### Expected result

VALUE resolves to base.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create `.env.dev` with VALUE=dotenv and build base app.env VALUE=base.
3. Compile service/mesh dev while recording effective app env.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Dotenv still contributes keys not overridden.

## MEN-015 — Build stage app.env overrides base app.env

**Normative basis:** Active build stage app env has higher precedence.

### Situation / fixture

Base app.env VALUE=base; dev.app.env VALUE=stage.

### Trigger

Compile dev.

### Expected result

VALUE=stage.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base app.env VALUE=base; dev.app.env VALUE=stage.
3. Compile dev.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Unchanged base env keys remain.

## MEN-016 — override-compose app environment overrides build stage app.env

**Normative basis:** Active override-compose app env is later precedence.

### Situation / fixture

dev.app.env VALUE=stage; dev override-compose services.app.environment VALUE=override.

### Trigger

Compile dev.

### Expected result

VALUE=override in app runtime environment.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. dev.app.env VALUE=stage; dev override-compose services.app.environment VALUE=override.
3. Compile dev.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Override applies only active stage.
- It does not mutate dependency env.

## MEN-017 — Mesh base service env overrides service override-compose env

**Normative basis:** Mesh base env follows project override-compose env.

### Situation / fixture

Service dev override-compose VALUE=override; mesh base service env VALUE=mesh-base.

### Trigger

Compile mesh dev.

### Expected result

VALUE=mesh-base.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Service dev override-compose VALUE=override; mesh base service env VALUE=mesh-base.
3. Compile mesh dev.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Standalone dev still sees override if no mesh layer.

## MEN-018 — Mesh stage service env overrides mesh base env

**Normative basis:** Mesh active-stage env is the highest user-controlled mesh env layer.

### Situation / fixture

Mesh base VALUE=mesh-base; mesh dev service env VALUE=mesh-dev.

### Trigger

Compile mesh dev.

### Expected result

VALUE=mesh-dev.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh base VALUE=mesh-base; mesh dev service env VALUE=mesh-dev.
3. Compile mesh dev.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Other mesh base keys survive.

## MEN-019 — Builder internal environment keys cannot be overridden by user layers

**Normative basis:** Builder internal keys are authoritative and conflicts are errors.

### Situation / fixture

Parameterize `.env`, base app.env, stage app.env, override-compose env, mesh base env, mesh stage env trying to set EXEC_MODE, INFRA_MODE, or effective PORT.

### Trigger

Compile relevant compositions.

### Expected result

Builder fails rather than silently accepting/overwriting a user definition for keys Builder owns in that composition.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Parameterize `.env`, base app.env, stage app.env, override-compose env, mesh base env, mesh stage env trying to set EXEC_MODE, INFRA_MODE, or effective PORT.
3. Compile relevant compositions.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Diagnostic identifies conflicting key/source layer.
- No precedence-based silent override is used for Builder-owned values.

## MEN-020 — Full app environment precedence matrix

**Normative basis:** Environment precedence is deterministic.

### Situation / fixture

Give the same normal key `VALUE` different values at all six user layers and additional unique sentinel keys at each layer.

### Trigger

Compile mesh dev and inspect final runtime env.

### Expected result

Winning VALUE is mesh dev-stage value; all unique sentinels survive unless shadowed.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Give the same normal key `VALUE` different values at all six user layers and additional unique sentinel keys at each layer.
3. Compile mesh dev and inspect final runtime env.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Observed order matches dotenv < build base < build stage < override-compose < mesh base < mesh stage.

## MEN-021 — Runtime env is not implicitly Docker build args

**Normative basis:** V2 separates runtime env from build args.

### Situation / fixture

Set app.env RUNTIME_ONLY=secretish-value; Dockerfile build stage records only explicitly provided ARG values.

### Trigger

Build/compile without override-compose build.args.

### Expected result

RUNTIME_ONLY is present at runtime but not automatically passed as a build arg.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Set app.env RUNTIME_ONLY=secretish-value; Dockerfile build stage records only explicitly provided ARG values.
3. Build/compile without override-compose build.args.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Build logs/artifact show no implicit ARG.
- Runtime container env contains value.

## MEN-022 — E2E uses .env.e2e and not .env.prod

**Normative basis:** E2E is its own runtime stage.

### Situation / fixture

Create .env.prod PROD_FILE=yes and .env.e2e E2E_FILE=yes.

### Trigger

Compile/run service or mesh E2E.

### Expected result

E2E runtime receives E2E_FILE but not PROD_FILE unless independently declared.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create .env.prod PROD_FILE=yes and .env.e2e E2E_FILE=yes.
3. Compile/run service or mesh E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Prod image target does not cause prod env-file inheritance.

## MEN-023 — Mesh E2E does not inherit mesh.prod overlay

**Normative basis:** E2E does not inherit mesh.prod.

### Situation / fixture

mesh.prod backend env ONLY_PROD=yes; mesh.e2e backend env ONLY_E2E=yes.

### Trigger

Compile global E2E.

### Expected result

Effective backend app gets ONLY_E2E and not ONLY_PROD unless base also defines it.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. mesh.prod backend env ONLY_PROD=yes; mesh.e2e backend env ONLY_E2E=yes.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Production Docker target selection remains separate.

## MEN-024 — Mesh E2E applies mesh.e2e overlay

**Normative basis:** Global E2E uses e2e stage configuration.

### Situation / fixture

Base env A=base; e2e env A=e2e,E2E=yes.

### Trigger

Compile global E2E.

### Expected result

Effective runtime env uses E2E overlay.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base env A=base; e2e env A=e2e,E2E=yes.
3. Compile global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- A=e2e.
- E2E=yes.

## MEN-025 — Mesh dev is integrated while retaining dev runtime config

**Normative basis:** Mesh dev is an integrated composition.

### Situation / fixture

Services have local dependencies and dev-specific env/override-compose.

### Trigger

Compile mesh dev.

### Expected result

Apps use dev targets/runtime config while effective local dependencies materialize unless substituted.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Services have local dependencies and dev-specific env/override-compose.
3. Compile mesh dev.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- EXEC_MODE=dev.
- INFRA_MODE=integrated.
- Dev overrides active.

## MEN-026 — Mesh prod is integrated with prod runtime config

**Normative basis:** Mesh prod semantics are integrated.

### Situation / fixture

Services have prod env and local dependencies.

### Trigger

Compile mesh prod.

### Expected result

Apps use prod target/runtime and integrated dependencies.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Services have prod env and local dependencies.
3. Compile mesh prod.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- EXEC_MODE=prod.
- INFRA_MODE=integrated.
- Prod overlay active.

## MEN-027 — Mesh test-unit uses isolated service test mode

**Normative basis:** Mesh test-unit is isolated.

### Situation / fixture

Mesh has multiple services each with test target and dependencies.

### Trigger

Run/compile mesh test-unit.

### Expected result

Each service unit phase uses its isolated test configuration without local dependencies.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh has multiple services each with test target and dependencies.
3. Run/compile mesh test-unit.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- test target selected.
- INFRA_MODE=isolated.
- No dependency bundles.

## MEN-028 — Global mesh E2E is integrated e2e runtime over production app images

**Normative basis:** Global E2E separates production image target from e2e runtime stage.

### Situation / fixture

Define e2e overlays and global tester.

### Trigger

Compile/run global E2E.

### Expected result

Top-level applications use prod image targets but e2e runtime overlays and integrated effective dependencies.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Define e2e overlays and global tester.
3. Compile/run global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- App target=prod.
- EXEC_MODE=e2e.
- INFRA_MODE=integrated.
- Tester is separate Compose runner.

## MEN-029 — Invalid effective stage fails even if base alone is valid

**Normative basis:** Validation occurs after stage merge.

### Situation / fixture

Base app has one primary; e2e overlay adds second endpoint with primary true, or e2e binding points to missing provider.

### Trigger

Compile base prod and e2e.

### Expected result

Prod succeeds; e2e fails effective semantic validation.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Base app has one primary; e2e overlay adds second endpoint with primary true, or e2e binding points to missing provider.
3. Compile base prod and e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Validation is not limited to source fragments.
- Error identifies e2e effective path.

## MEN-030 — Mesh env never configures local dependency implementation

**Normative basis:** Environment ownership remains consumer-side/module-specific.

### Situation / fixture

Mesh backend env sets DB_MODE=external; backend local postgres dependency env sets DB_MODE=local.

### Trigger

Compile integrated mesh.

### Expected result

Backend app sees external while postgres bundle sees dependency-owned local value.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Mesh backend env sets DB_MODE=external; backend local postgres dependency env sets DB_MODE=local.
3. Compile integrated mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No accidental propagation from mesh service env into dependency services.
