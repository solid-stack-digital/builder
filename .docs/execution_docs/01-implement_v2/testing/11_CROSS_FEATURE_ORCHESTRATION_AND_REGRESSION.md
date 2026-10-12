# Cross-Feature Orchestration and Regression

> Builder V2 conformance test conditions. These scenarios are derived from the final V2 specification and are intended to serve as acceptance criteria for an implementation that does not yet exist.

## Scope

Large and canonical end-to-end compositions that combine schema, stages, dependencies, substitution, lifecycle, publication, testers, deterministic allocation, diagnostics, cleanup, and legacy rejection. These cases are the final integration gate after focused unit/contract suites pass.

## Test execution convention

Use the lowest test layer that can prove the invariant:

- **schema/config unit test** for JSON shape, field type, identifier, and unsupported-field validation;
- **compiler unit/integration test** for overlays, references, substitution, publication, namespacing, lifecycle graphs, port allocation, and generated Compose;
- **Docker/Compose integration test** for real health transitions, DNS reachability, environment propagation, host publication, and resource behavior;
- **CLI/E2E test** for command sequencing, exit-code propagation, cleanup, and black-box tester semantics.

A scenario passes only when both its positive behavior and its stated non-effects are verified.

## Scenario count

**30 scenarios**

## SYS-001 — Canonical comprehensive service compiles in every supported stage

**Normative basis:** A full service fixture should exercise all build.json mechanisms together.

### Situation / fixture

Build the canonical rich service fixture: two app endpoints, multi-service firebase, redis, worker dependency dependsOn redis, tester env, dev/prod/test/e2e overlays, and E2E-only mailpit.

### Trigger

Compile dev, dev --full, prod, test-unit, test-e2e and aggregate test effective models.

### Expected result

Every stage matches its normative target/runtime/materialization/overlay behavior without configuration drift.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Build the canonical rich service fixture: two app endpoints, multi-service firebase, redis, worker dependency dependsOn redis, tester env, dev/prod/test/e2e overlays, and E2E-only mailpit.
3. Compile dev, dev --full, prod, test-unit, test-e2e and aggregate test effective models.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Plain dev/test-unit have no local deps.
- Integrated stages materialize effective deps.
- E2E uses prod app target + e2e runtime.
- Stage-only mailpit appears only E2E.

## SYS-002 — Canonical comprehensive mesh compiles in all mesh stages

**Normative basis:** A full mesh fixture validates cross-feature composition.

### Situation / fixture

Compose backend/frontend/gateway, provider substitutions, explicit dependsOn, publication, stage env, E2E-only fake service, and global tester.

### Trigger

Compile mesh dev/prod/test-unit/global-e2e and aggregate test.

### Expected result

Each stage derives a deterministic valid effective topology.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Compose backend/frontend/gateway, provider substitutions, explicit dependsOn, publication, stage env, E2E-only fake service, and global tester.
3. Compile mesh dev/prod/test-unit/global-e2e and aggregate test.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Dev/prod integrated topologies valid.
- Test-unit isolated service tests.
- E2E applies E2E providers/publications/tester.

## SYS-003 — Large mesh tolerates repeated raw dependency resource names

**Normative basis:** Namespacing must scale beyond toy examples.

### Situation / fixture

Generate 12 mesh services, each with one local dependency whose Compose services/resources are identically named `db`, `helper`, `data`, `config`.

### Trigger

Compile integrated mesh.

### Expected result

Namespacing isolates every dependency implementation.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Generate 12 mesh services, each with one local dependency whose Compose services/resources are identically named `db`, `helper`, `data`, `config`.
3. Compile integrated mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No generated Compose key/resource collision.
- Every consumer endpoint resolves to its own owner.

## SYS-004 — Large acyclic substitution graph compiles deterministically

**Normative basis:** Builder normalization must be deterministic at realistic graph size.

### Situation / fixture

Generate a DAG of 20 top-level services with multiple logical slot bindings and explicit lifecycle edges but no cycle.

### Trigger

Compile repeatedly with shuffled JSON key order.

### Expected result

Logical output/topology is equivalent and all dependencies resolve.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Generate a DAG of 20 top-level services with multiple logical slot bindings and explicit lifecycle edges but no cycle.
3. Compile repeatedly with shuffled JSON key order.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No false cycle.
- Substitution edges point to correct providers.
- AUTO allocation follows documented sort independent of source order.

## SYS-005 — Large mixed-edge cycle is detected

**Normative basis:** Fail-fast cycle detection covers the effective graph.

### Situation / fixture

Start from SYS-004 and add one edge closing a cycle through local substitution and explicit mesh dependsOn links.

### Trigger

Compile.

### Expected result

Builder fails and surfaces a useful logical cycle rather than hanging/topologically truncating.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Start from SYS-004 and add one edge closing a cycle through local substitution and explicit mesh dependsOn links.
3. Compile.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Cycle includes automatic and explicit edges.
- No partial Docker start.

## SYS-006 — Every endpoint property resolves correctly in one fixture

**Normative basis:** Endpoint property contract is the stable reference surface.

### Situation / fixture

Expose one fixed published app endpoint and one dependency endpoint; populate env keys for all eight endpoint properties where legal.

### Trigger

Compile standalone integrated and mesh published variants.

### Expected result

network/public host, port, address, URL values follow exact V2 semantics.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Expose one fixed published app endpoint and one dependency endpoint; populate env keys for all eight endpoint properties where legal.
3. Compile standalone integrated and mesh published variants.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- network_port equals container port.
- public_host=127.0.0.1.
- URLs include schemes.
- Unpublished control endpoint lacks public properties.

## SYS-007 — Fixed plus AUTO allocations are deterministic under JSON reorder

**Normative basis:** Port allocation order is semantic, not parser insertion order.

### Situation / fixture

Create several fixed and AUTO published app/dependency endpoints, then serialize equivalent mesh/build objects in multiple key orders.

### Trigger

Compile each from equivalent clean allocation conditions.

### Expected result

Fixed mappings are identical and AUTO allocation sequence follows documented normalized sorting.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create several fixed and AUTO published app/dependency endpoints, then serialize equivalent mesh/build objects in multiple key orders.
3. Compile each from equivalent clean allocation conditions.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No source-order dependence.
- AUTO never occupies fixed reservations.

## SYS-008 — Equivalent config compilation is semantically deterministic

**Normative basis:** Builder V2 promises explicit deterministic composition.

### Situation / fixture

Compile same effective config multiple times with no external port/resource changes.

### Trigger

Normalize away Builder-private generated names/timestamps if any and compare logical Compose models.

### Expected result

Logical services, edges, env, publications, and endpoint values remain stable.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Compile same effective config multiple times with no external port/resource changes.
3. Normalize away Builder-private generated names/timestamps if any and compare logical Compose models.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No nondeterministic missing/extra resource.
- AUTO remains cached when available.

## SYS-009 — Fail-fast errors prevent partial runtime startup

**Normative basis:** Invalid declared configuration fails before runtime whenever possible.

### Situation / fixture

Parameterize invalid missing healthcheck, bad endpoint owner, port conflict, path escape, unresolved reference, and lifecycle cycle.

### Trigger

Invoke command path that would normally execute Docker.

### Expected result

Each case fails during validation/compilation before application/dependency containers are started.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Parameterize invalid missing healthcheck, bad endpoint owner, port conflict, path escape, unresolved reference, and lifecycle cycle.
3. Invoke command path that would normally execute Docker.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No fixture runtime markers/containers exist.
- Diagnostic is configuration-oriented rather than downstream Docker bind/DNS error.

## SYS-010 — Mesh aggregate test runs isolated service tests before global E2E

**Normative basis:** Mesh test orchestrates isolated tests then global E2E.

### Situation / fixture

Instrument each service test target and global E2E tester with ordered markers.

### Trigger

Run mesh aggregate `test` command.

### Expected result

Service isolated/unit tests complete before global integrated E2E begins.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Instrument each service test target and global E2E tester with ordered markers.
3. Run mesh aggregate `test` command.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Unit/test phase markers precede tester marker.
- Global E2E apps/deps are not started prematurely.

## SYS-011 — Any required unit failure aborts mesh global E2E

**Normative basis:** Aggregate test honors fail-fast phase ordering.

### Situation / fixture

Make one service isolated test fail; global tester would create unmistakable marker.

### Trigger

Run mesh aggregate test.

### Expected result

Overall command fails and global E2E does not run.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Make one service isolated test fail; global tester would create unmistakable marker.
3. Run mesh aggregate test.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Tester marker absent.
- No unnecessary global E2E topology remains.

## SYS-012 — Passing service tests proceed to global E2E

**Normative basis:** Aggregate orchestration transitions only after unit success.

### Situation / fixture

All service test targets exit 0; global tester validates public gateway.

### Trigger

Run mesh aggregate test.

### Expected result

Builder proceeds to global E2E and returns its result.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. All service test targets exit 0; global tester validates public gateway.
3. Run mesh aggregate test.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- All service unit markers present before E2E.
- Tester gets public URL only.

## SYS-013 — Global E2E failure propagates through aggregate test

**Normative basis:** Later phase result must propagate.

### Situation / fixture

All unit tests pass; global tester exits nonzero.

### Trigger

Run mesh aggregate test.

### Expected result

Overall command is nonzero and identifies global E2E failure.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. All unit tests pass; global tester exits nonzero.
3. Run mesh aggregate test.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Earlier unit success is not mistaken for overall success.

## SYS-014 — Successful finite test execution cleans up test topology

**Normative basis:** Finite test orchestration must leave a clean environment.

### Situation / fixture

Use passing service/global finite testers and record Docker resources before invocation.

### Trigger

Run test command to completion.

### Expected result

Transient test composition is torn down according to Builder’s execution contract; no orphan test-only services remain.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Use passing service/global finite testers and record Docker resources before invocation.
3. Run test command to completion.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No tester container running afterward.
- No E2E-only dependency/provider container remains.

## SYS-015 — Failed finite test execution also cleans up safely

**Normative basis:** Test cleanup must not depend on success.

### Situation / fixture

Tester intentionally fails after apps/deps start.

### Trigger

Run test and inspect resources after Builder exits.

### Expected result

Failure result is preserved while transient topology is torn down rather than leaked.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Tester intentionally fails after apps/deps start.
3. Run test and inspect resources after Builder exits.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No stale tester/e2e fixture containers.
- Diagnostic/result remains available.

## SYS-016 — Application sees same logical dependency contract local vs provider

**Normative basis:** Logical dependency identity is independent from concrete provider identity.

### Situation / fixture

Consumer app logs resolved BACKEND_URL from logical slot. Compile standalone integrated with local mock then mesh with provider exposing same endpoint name but different host/port.

### Trigger

Run both and compare application configuration shape.

### Expected result

App uses same env key/reference expression; only resolved implementation address differs.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Consumer app logs resolved BACKEND_URL from logical slot. Compile standalone integrated with local mock then mesh with provider exposing same endpoint name but different host/port.
3. Run both and compare application configuration shape.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No application code/config branch on mock vs real.
- Local run points to local owner; mesh run points to provider.

## SYS-017 — Dependency Compose host-port bypass is rejected even in large mesh

**Normative basis:** Host exposure stays under Builder endpoint/publication control.

### Situation / fixture

Insert `ports:` into one deeply nested local dependency Compose among otherwise valid services.

### Trigger

Compile mesh.

### Expected result

Entire composition fails before any Docker start.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Insert `ports:` into one deeply nested local dependency Compose among otherwise valid services.
3. Compile mesh.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Offending consumer/dependency/service is identifiable.
- Builder does not strip forbidden ports and continue.

## SYS-018 — Invalid app Dockerfile contract breaks mesh before runtime

**Normative basis:** Each independently runnable service must satisfy Dockerfile contract.

### Situation / fixture

One mesh service Dockerfile contains forbidden EXPOSE or lacks required prod healthcheck.

### Trigger

Compile mesh prod/global E2E.

### Expected result

Builder rejects the service contract before composing a weakened mesh.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. One mesh service Dockerfile contains forbidden EXPOSE or lacks required prod healthcheck.
3. Compile mesh prod/global E2E.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Error attributes failure to service/path/target.
- Other services are not started as partial mesh.

## SYS-019 — Every Builder-generated lifecycle edge is health-gated

**Normative basis:** V2 forbids readiness weakening.

### Situation / fixture

Construct fixture producing local app->dep, dep->dep, substitution, explicit mesh dependsOn, and tester->apps edges.

### Trigger

Compile and enumerate generated Builder-owned depends_on relations.

### Expected result

Every readiness edge uses `condition: service_healthy` where V2 defines lifecycle gating.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Construct fixture producing local app->dep, dep->dep, substitution, explicit mesh dependsOn, and tester->apps edges.
3. Compile and enumerate generated Builder-owned depends_on relations.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No `service_started` appears as Builder fallback.
- Internal user Compose edges are distinguishable from Builder-generated edges.

## SYS-020 — Environment references never create hidden lifecycle edges

**Normative basis:** Wiring and lifecycle are independent.

### Situation / fixture

Add many cross-service/dependency endpoint env references while leaving dependsOn/bindings unchanged.

### Trigger

Compare lifecycle graph before/after env-only changes.

### Expected result

Only endpoint values/env change; graph is unchanged except automatic local dependency edges that exist regardless of refs.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Add many cross-service/dependency endpoint env references while leaving dependsOn/bindings unchanged.
3. Compare lifecycle graph before/after env-only changes.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No hidden ordering induced by env reference count.

## SYS-021 — Lifecycle declarations never create hidden environment values

**Normative basis:** dependsOn has no env side effect.

### Situation / fixture

Add dependency dependsOn and mesh dependsOn edges without adding env references/keys.

### Trigger

Compare app/dependency environments.

### Expected result

No connection URLs/hosts are auto-injected solely because of lifecycle edges.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Add dependency dependsOn and mesh dependsOn edges without adding env references/keys.
3. Compare app/dependency environments.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Environment remains explicitly consumer-owned.

## SYS-022 — Stage isolation regression matrix

**Normative basis:** V2 stage overlays are active-stage-specific and non-destructive.

### Situation / fixture

Prepare sentinels unique to dev/prod/test/e2e in env, endpoints, dependencies, service additions, bindings, and publications.

### Trigger

Compile every command/stage and generate a matrix of which sentinels are effective.

### Expected result

Only base + active stage declarations appear; E2E never inherits prod runtime overlay accidentally.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Prepare sentinels unique to dev/prod/test/e2e in env, endpoints, dependencies, service additions, bindings, and publications.
3. Compile every command/stage and generate a matrix of which sentinels are effective.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No cross-stage leakage.
- Base declarations persist when not overridden.

## SYS-023 — Every documented legacy field is rejected rather than translated

**Normative basis:** V2 is intentionally breaking with no silent migration.

### Situation / fixture

Generate parameterized fixtures containing each removed build and mesh field listed by V2.

### Trigger

Validate each fixture individually.

### Expected result

Every legacy field causes a fail-fast error.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Generate parameterized fixtures containing each removed build and mesh field listed by V2.
3. Validate each fixture individually.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No old field changes generated topology.
- No deprecation-only success path.

## SYS-024 — Nested failure diagnostic contains actionable context

**Normative basis:** Fail-fast diagnostics should preserve logical configuration context.

### Situation / fixture

Create invalid reference inside e2e stage dependency env of one service in a large mesh.

### Trigger

Compile e2e.

### Expected result

Error includes source file/logical path/offending reference/object/active stage and reason as applicable.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create invalid reference inside e2e stage dependency env of one service in a large mesh.
3. Compile e2e.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Developer can locate failing declaration without inspecting generated Compose names.

## SYS-025 — User JSON never needs Builder-private generated service names

**Normative basis:** Generated Compose identities are private implementation details.

### Situation / fixture

Run all fixtures using only app/dependencies/mesh logical reference grammar; prohibit hardcoded generated names in test inputs.

### Trigger

Compile/run integration suite.

### Expected result

Every supported wiring/publication/lifecycle use case succeeds through logical contracts alone.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Run all fixtures using only app/dependencies/mesh logical reference grammar; prohibit hardcoded generated names in test inputs.
3. Compile/run integration suite.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No fixture depends on implementation naming convention.

## SYS-026 — Both service and global E2E tests remain black-box

**Normative basis:** Testers rely only on host-published endpoints.

### Situation / fixture

Service tester and mesh tester each attempt supported public request; control variants attempt network_* references.

### Trigger

Compile/run.

### Expected result

Public variants pass; internal-network variants fail at configuration time.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Service tester and mesh tester each attempt supported public request; control variants attempt network_* references.
3. Compile/run.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No test runner requires Docker DNS/private service names.

## SYS-027 — AUTO cache recovery remains non-semantic

**Normative basis:** AUTO cache is disposable implementation state.

### Situation / fixture

Compile AUTO mesh, save logical model; delete cache and recompile under different port availability.

### Trigger

Compare excluding concrete public ports.

### Expected result

Configuration/topology remains semantically identical even if AUTO values move.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Compile AUTO mesh, save logical model; delete cache and recompile under different port availability.
3. Compare excluding concrete public ports.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Provider bindings/lifecycle/env templates still resolve correctly to new concrete values.

## SYS-028 — Large-mesh port collision points to both owners

**Normative basis:** Fixed collisions are explicit compile failures.

### Situation / fixture

Create 20+ published endpoints and intentionally give two distant logical paths same fixed port.

### Trigger

Compile.

### Expected result

Builder pinpoints both conflicting endpoints, not merely numeric port.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Create 20+ published endpoints and intentionally give two distant logical paths same fixed port.
3. Compile.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Port conflict is discovered before Docker bind.
- Unrelated endpoints remain distinguishable in diagnostics.

## SYS-029 — Substitution leaves no orphan dependency artifacts

**Normative basis:** Atomic suppression applies to implementation resources, not only endpoint owner.

### Situation / fixture

For many consumers, substitute dependencies whose local bundles each contain services, volumes, configs, secrets, networks.

### Trigger

Compile and inventory generated resources against unsubstituted control.

### Expected result

Every substituted local artifact disappears as a unit.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. For many consumers, substitute dependencies whose local bundles each contain services, volumes, configs, secrets, networks.
3. Compile and inventory generated resources against unsubstituted control.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- No orphan resources.
- No stale references.
- Unsubstituted controls remain.

## SYS-030 — Gateway-only public black-box system smoke

**Normative basis:** Mesh publication is explicit and supports true black-box boundary testing.

### Situation / fixture

Compose backend/frontend/gateway; keep backend/frontend private; gateway publishes one public HTTP endpoint and depends/binds appropriately. Global tester only gets gateway.public_url.

### Trigger

Run global E2E smoke requests routed through gateway to frontend/backend.

### Expected result

System works with a single deliberate public entry point while internal services remain private.

### How to test

1. Create a fresh temporary fixture directory so no `.builder` state, Compose project, or Docker resource from another case can affect this scenario.
2. Compose backend/frontend/gateway; keep backend/frontend private; gateway publishes one public HTTP endpoint and depends/binds appropriately. Global tester only gets gateway.public_url.
3. Run global E2E smoke requests routed through gateway to frontend/backend.
4. Run the Builder compile/dry-run path first and capture the normalized/generated Compose model, resolved environment, diagnostics, and exit status. If compilation is expected to succeed, run the corresponding execution path as an integration assertion where Docker behavior is material to the case.
5. Inspect the generated model by logical role rather than assuming Builder-private generated names; correlate generated resources back to the configured service/dependency/endpoint paths.
6. Assert the exact conditions listed below. For a negative case, additionally assert that Builder fails before starting an incomplete composition.

### Required assertions

- Tester reaches gateway.
- Gateway reaches internal services through network refs.
- Backend/frontend public_* remain unavailable unless published.
