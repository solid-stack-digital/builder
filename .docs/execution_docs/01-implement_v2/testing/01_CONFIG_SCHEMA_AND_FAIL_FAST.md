# 01 — Configuration Schema, Identifier Rules, Legacy Rejection, and Fail-Fast Errors

> Builder V2 conformance test conditions. These scenarios are derived from the final V2 specification and are intended to serve as acceptance criteria for an implementation that does not yet exist.

## Scope

Exhaustively validates V2 JSON/YAML shape, field types, identifiers, required fields, path boundaries, primary/port/scheme rules, missing artifacts, legacy/unknown-field rejection, and diagnostic quality. Runtime topology is used only to prove invalid configuration does not proceed.

## Test execution convention

Use the lowest test layer that can prove the invariant:

- **schema/config unit test** for JSON shape, field type, identifier, and unsupported-field validation;
- **compiler unit/integration test** for overlays, references, substitution, publication, namespacing, lifecycle graphs, port allocation, and generated Compose;
- **Docker/Compose integration test** for real health transitions, DNS reachability, environment propagation, host publication, and resource behavior;
- **CLI/E2E test** for command sequencing, exit-code propagation, cleanup, and black-box tester semantics.

A scenario passes only when both its positive behavior and its stated non-effects are verified.

## Scenario count

**41 scenarios**

## CFG-001 — Minimal valid build.json

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

A service directory contains a valid V2 application Dockerfile and `build.json` with only the required `app` object: `{ "app": {} }`.

### Trigger

Load and compile a stage that does not require optional endpoints, dependencies, tester, or overrides.

### Expected result

Builder accepts the configuration and does not synthesize V1 shortcuts.

### How to test

1. Validate with the V2 schema.
2. Compile without starting Docker.
3. Inspect the normalized model.

### Required assertions

- `app` exists.
- No app endpoint is invented.
- No Builder-derived `PORT` is injected because there is no primary endpoint.

## CFG-002 — build.json root type validation

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

`build.json` contains `null`, an array, string, number, or boolean instead of an object.

### Trigger

Load `build.json`.

### Expected result

Every non-object root fails before Docker or Compose processing.

### How to test

1. Parameterize over `null`, `[]`, `"x"`, `1`, `true`.
2. Assert each fails at parse/schema validation.

### Required assertions

- No coercion occurs.
- Error identifies `build.json` root.

## CFG-003 — Required app object

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

`build.json` is otherwise valid but omits `app`.

### Trigger

Validate.

### Expected result

Fail-fast. Builder does not invent an empty app.

### How to test

1. Use `{}` and `{ "name":"x" }`.
2. Assert validation failure.

### Required assertions

- Logical path identifies missing `app`.

## CFG-004 — app must be object

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

`app` is null, array, string, number, or boolean.

### Trigger

Validate.

### Expected result

All forms fail.

### How to test

1. Parameterize invalid JSON types.

### Required assertions

- Error path is `app`.

## CFG-005 — All Builder env values must be strings

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Put a non-string value in each env-bearing location: base/stage app env, dependency env, stage dependency env, service tester env, mesh service env, mesh tester env.

### Trigger

Validate the relevant standalone or mesh composition.

### Expected result

Numbers, booleans, arrays, objects, and null fail. Builder never stringifies them.

### How to test

1. Parameterize env location × invalid JSON type.
2. Use equivalent string values as positive controls.

### Required assertions

- Offending key/value and logical path are reported.

## CFG-006 — Dependency key grammar

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Create dependency keys covering valid and invalid lexical forms.

### Trigger

Validate.

### Expected result

Only `^[a-z][a-z0-9-]*$` passes.

### How to test

1. Valid: `a`, `redis`, `payments-api`, `a0`, `x-1`.
2. Invalid: `Redis`, `0redis`, `-redis`, `redis_1`, `redis.api`, spaces, empty key.

### Required assertions

- No automatic renaming.

## CFG-007 — Endpoint key grammar

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Use valid and invalid names for both app endpoints and dependency endpoints.

### Trigger

Validate.

### Expected result

Only `^[a-z][a-z0-9-]*$` passes.

### How to test

1. Reuse the identifier table from CFG-006 for both endpoint collections.

### Required assertions

- Error distinguishes app vs dependency path.

## CFG-008 — Mesh service key grammar

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Top-level mesh service keys include capitalization, underscore, dot, leading digit, spaces, or empty key.

### Trigger

Validate mesh.

### Expected result

Invalid names fail; valid lexical names proceed to reserved-name validation.

### How to test

1. Parameterize service keys with a minimal valid service directory.

### Required assertions

- Builder does not normalize names.

## CFG-009 — Reserved mesh service names

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Use each reserved structural identifier as a top-level mesh service: `app`, `dependencies`, `tester`, `services`, `dev`, `prod`, `test`, `e2e`.

### Trigger

Validate.

### Expected result

Every reserved name fails even though it may match the lexical regex.

### How to test

1. Parameterize all reserved names.

### Required assertions

- Diagnostic identifies the reserved service key.

## CFG-010 — Endpoint port lower bound

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Set app/dependency endpoint `port` to zero or negative values.

### Trigger

Validate.

### Expected result

Fail; valid numeric range is 1..65535.

### How to test

1. Test base and stage-added endpoints.

### Required assertions

- No generated Compose is emitted.

## CFG-011 — Endpoint port upper bound

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Set endpoint `port` to 65536 or larger.

### Trigger

Validate.

### Expected result

Fail range validation.

### How to test

1. Test 65536, 99999, and a very large integer.

### Required assertions

- Offending logical endpoint path is named.

## CFG-012 — Endpoint port type

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Set `port` to `"3000"`, `"AUTO"`, float, boolean, null, object, or array.

### Trigger

Validate.

### Expected result

All fail because network/container port is an integer number.

### How to test

1. Parameterize app and dependency endpoints.

### Required assertions

- No string-to-number conversion.

## CFG-013 — Valid publicPort forms

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Set `publicPort` to a valid integer, `"AUTO"`, or omit it.

### Trigger

Validate.

### Expected result

All three forms are schema-valid and retain their distinct semantics.

### How to test

1. Compile without collisions and inspect normalized endpoint metadata.

### Required assertions

- `publicPort` never changes endpoint `port`.

## CFG-014 — Invalid publicPort forms

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Use 0, 65536, `"3000"`, `"auto"`, `"RANDOM"`, float, boolean, null, object, or array.

### Trigger

Validate.

### Expected result

All fail except valid integer range or exact uppercase `"AUTO"`.

### How to test

1. Parameterize app/dependency endpoint paths.

### Required assertions

- No coercion or case normalization.

## CFG-015 — Scheme lexical grammar

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Use schemes on both sides of `^[A-Za-z][A-Za-z0-9+.-]*$`.

### Trigger

Validate.

### Expected result

`http`, `HTTP`, `grpc`, `redis`, `foo+bar`, `x.y`, `x-y` pass; empty, `1http`, `_http`, `http://`, slash/space forms fail.

### How to test

1. Parameterize both app and dependency endpoint scheme fields.

### Required assertions

- An unfamiliar but lexically valid scheme passes; there is no protocol whitelist.

## CFG-016 — Exactly one app primary

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Create non-empty app endpoint collections with zero primaries and with multiple primaries.

### Trigger

Validate effective composition.

### Expected result

Both cases fail; omission means false and Builder never chooses first endpoint.

### How to test

1. Test one-endpoint/no-primary, two-endpoint/no-primary, two-primary, and a stage overlay that creates a second primary.

### Required assertions

- Error states the exactly-one-primary invariant.

## CFG-017 — Exactly one dependency primary

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Create non-empty dependency endpoint collections with zero or multiple primaries.

### Trigger

Validate.

### Expected result

Fail regardless of whether endpoints share or differ in owner service.

### How to test

1. Test same-owner and different-owner forms.

### Required assertions

- Primary does not define a principal service.

## CFG-018 — Empty endpoint collections

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Use `app.endpoints:{}` and a dependency with `endpoints:{}`.

### Trigger

Compile integrated mode.

### Expected result

Empty app endpoints require no primary; empty dependency is inert and not materialized.

### How to test

1. Inspect normalized model and generated Compose.

### Required assertions

- No dependency services/resources appear.

## CFG-019 — Dependency endpoint service required

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

A dependency endpoint has port/primary/scheme but no `service`; Compose contains exactly one service.

### Trigger

Compile integrated mode.

### Expected result

Fail; Builder never infers endpoint ownership.

### How to test

1. Use a one-service Compose file specifically to test non-inference.

### Required assertions

- Error path names endpoint `service`.

## CFG-020 — Dependency-level service shortcut rejected

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Add `service` directly under a dependency object.

### Trigger

Validate.

### Expected result

Fail as a removed/unsupported V1 shortcut.

### How to test

1. Pair with endpoint-level `service` positive control.

### Required assertions

- No migration to endpoint ownership.

## CFG-021 — Materialized dependency needs compose

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

An effective dependency has endpoints but no base or stage `compose`.

### Trigger

Compile integrated mode.

### Expected result

Fail effective contract validation.

### How to test

1. Test base dependency and stage-added dependency variants.

### Required assertions

- Error names stage and dependency.

## CFG-022 — Dockerfile default selection

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

`dockerfile` omitted; a valid root `Dockerfile` exists.

### Trigger

Compile.

### Expected result

Builder selects `<service>/Dockerfile`.

### How to test

1. Inspect generated build configuration.
2. Remove/rename the file and assert missing-file failure.

### Required assertions

- No alternate filename is guessed.

## CFG-023 — Dockerfile path project boundary

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Use valid nested Dockerfile path, then normalized traversal/absolute path outside service root.

### Trigger

Compile.

### Expected result

In-project relative path passes; escaped path fails.

### How to test

1. Create real outside fixture so boundary, not not-found, is tested.

### Required assertions

- Resolved path cannot escape project root.

## CFG-024 — Dependency compose path project boundary

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Use valid in-project dependency Compose then `../outside.yml`/normalized traversal.

### Trigger

Compile integrated.

### Expected result

In-project path passes; escape fails before merge/runtime.

### How to test

1. Use actual fixture files.

### Required assertions

- Error identifies `dependencies.<name>.compose`.

## CFG-025 — override-compose path boundary

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Active stage selects in-project override, then escaped override.

### Trigger

Compile active stage.

### Expected result

Valid file loads; escaped path fails.

### How to test

1. Also compile an unrelated stage to prove the override is stage-selected.

### Required assertions

- Error names stage and path.

## CFG-026 — Missing declared file failures

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Reference missing Dockerfile, dependency Compose, active override Compose, mesh service path/build.json, or mesh tester Compose.

### Trigger

Compile the composition needing each declaration.

### Expected result

Every declared required artifact fails before runtime.

### How to test

1. Parameterize artifact kinds and verify Docker is not invoked.

### Required assertions

- Source config and missing filesystem path are in diagnostics.

## CFG-027 — Malformed JSON

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Corrupt build.json or mesh.json using trailing comma, missing brace, or malformed string.

### Trigger

Load configuration.

### Expected result

Parse error with source-file context; no schema/runtime work follows.

### How to test

1. Parameterize both files and corruption styles.

### Required assertions

- Not misreported as a missing semantic field.

## CFG-028 — Malformed dependency YAML

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

A materialized dependency points to invalid YAML.

### Trigger

Compile integrated effective stage.

### Expected result

Fail before any dependency service starts.

### How to test

1. Ensure dependency has endpoints so its implementation is relevant.

### Required assertions

- No partially emitted dependency bundle.

## CFG-029 — Malformed active override YAML

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Active-stage override-compose is invalid YAML.

### Trigger

Compile that stage.

### Expected result

Fail with stage/file context.

### How to test

1. Capture compiler error.

### Required assertions

- No app container starts.

## CFG-030 — Removed build root fields

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Add each legacy field: `port`, `envOverrides`, `overrides`, `composeFiles`, `services`, `policy`, `policies`, `injects`, `sidecars`.

### Trigger

Validate V2 build.json.

### Expected result

Every field is rejected; none is silently ignored or translated.

### How to test

1. Parameterize one legacy key at a time on otherwise valid V2 config.

### Required assertions

- Exact unsupported field is reported.

## CFG-031 — Removed dependency shortcuts

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Add dependency `path`, dependency-level `service`, dependency `port`, or dependency `ports`.

### Trigger

Validate.

### Expected result

Reject each old shortcut.

### How to test

1. Compare with equivalent V2 `compose` + named endpoint positive control.

### Required assertions

- No automatic V1-to-V2 translation.

## CFG-032 — Removed mesh fields

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Add root `dependencies` or service `port`, `preservePort`, `provideDependency`, `replaceMocks`, `envOverrides`, `healthcheck`.

### Trigger

Validate mesh.

### Expected result

Reject each legacy field.

### How to test

1. Parameterize service-level fields and root dependencies.

### Required assertions

- Mesh cannot override app health/endpoint truth with old fields.

## CFG-033 — Removed mesh tester fields

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Add tester `path`, `dockerfile`, `envOverrides`, or `policy`.

### Trigger

Validate.

### Expected result

Reject. V2 tester uses `compose`, `service`, `env` only.

### How to test

1. Parameterize on otherwise valid tester.

### Required assertions

- No translation to V2 fields.

## CFG-034 — inherit-published rejected

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Add old `inherit-published` behavior flag.

### Trigger

Validate mesh.

### Expected result

Fail; V2 publication must be explicit with `publish`.

### How to test

1. Test plausible old placements.

### Required assertions

- No implicit host exposure.

## CFG-035 — No first-class Builder secrets field

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Add `secrets` under build or mesh JSON; separately place a Docker Compose secret inside a dependency Compose.

### Trigger

Validate/compile.

### Expected result

Builder JSON `secrets` is rejected, while dependency-internal Compose secrets are allowed under Compose rules.

### How to test

1. Run negative JSON cases and positive Compose case.

### Required assertions

- Builder does not become a secrets manager.

## CFG-036 — app.dependsOn forbidden

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Add `app.dependsOn` in base or stage app.

### Trigger

Validate.

### Expected result

Fail; local app lifecycle is Builder-managed.

### How to test

1. Test base and stage forms.

### Required assertions

- No edge generated from forbidden field.

## CFG-037 — Unknown/misspelled fields fail closed

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Add `dependecies`, `endpoint`, `publsh`, `schem`, or arbitrary nested key.

### Trigger

Validate.

### Expected result

Fail instead of silently ignoring likely configuration mistakes.

### How to test

1. Test representative root, stage, endpoint, dependency, mesh service and tester objects.

### Required assertions

- Logical path of unknown field appears.

## CFG-038 — Mesh services required and non-empty

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Use missing services, null, non-object, or `{}`.

### Trigger

Validate mesh.

### Expected result

Each invalid form fails; at least one service is required.

### How to test

1. Parameterize invalid shapes plus a one-service positive control.

### Required assertions

- Failure occurs before tester execution.

## CFG-039 — Effective mesh service path required

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Base service or genuinely stage-added service has no effective path.

### Trigger

Compile active stage.

### Expected result

Fail. Existing service stage overlays may omit path only because they inherit base.

### How to test

1. Test base missing path, stage-new missing path, and inherited existing positive control.

### Required assertions

- Service/stage named in diagnostic.

## CFG-040 — Fail-fast diagnostic completeness

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Create a nested active-stage failure such as a mesh env reference to an unavailable endpoint property.

### Trigger

Compile.

### Expected result

Error is actionable: source file, logical path, offending/reference value, active stage/composition, and failure reason are available where applicable.

### How to test

1. Capture structured error or stderr and assert meaningful fields/substrings rather than brittle full message.

### Required assertions

- No Docker resources started.

## CFG-041 — No service_started weakening

**Normative basis:** SPECS_V2 §§3–5, 8–10, 29–30; BUILD_JSON_DOCS §§1–6, 13

### Situation / fixture

Create required lifecycle target without valid healthcheck.

### Trigger

Compile.

### Expected result

Fail; Builder never downgrades to `service_started`.

### How to test

1. Exercise dependency owner, mesh target, and substituted provider.

### Required assertions

- Generated Builder-owned edges never contain `service_started`.
