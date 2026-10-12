# 01 — Reject a null app healthcheck in a stage override

**ID:** V211-001. **Priority:** Medium. **Status:** implemented and verified on 2026-10-12. The original red test and implementation plan are preserved below.

## Bug report

**Bug.** A valid `build.json` can point its `prod.override-compose` to a Compose file containing `services.app.healthcheck: null`. `compileServiceComposition("prod", ...)` returns a composition with `app.healthcheck === null` and raises no `ConfigError`.

**Why this is a bug.** V2 §21 and Build JSON §10.1 allow an app override to adjust healthcheck timing, but forbid weakening or removing required app healthchecks. `null` is not a timing map. Docker Compose v5.5.1 rejects the generated form with `services.app.healthcheck must be a mapping`, so the current compiler delays a detectable configuration error until Docker. This violates V2 §4 fail-fast. The service Dockerfile healthcheck requirement does not make an invalid Compose override valid.

**Cause and location.** [validateOverrideCompose.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateOverrideCompose.ts:38) enters its timing-key check only when `app.healthcheck` is truthy and an object. `null` skips the check; [mergeAppOverride.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/mergeAppOverride.ts) then copies the scalar into the final app service.

**Expected behavior.** If an override declares `healthcheck`, its value must be a non-null mapping whose keys are restricted to `interval`, `timeout`, `retries`, `start_period`, and `start_interval`. A null, list, string, or disable/test replacement fails with a `ConfigError` naming the override Compose file and `services.app.healthcheck`. A timing-only mapping remains accepted. Dockerfile `HEALTHCHECK` stays authoritative for the command.

## Red test gate before fixing

Install the shared reproduction as shown in [the index](00-audit-index.md), then run:

```bash
pnpm exec vitest run tests/conformance/v211-audit.test.ts -t V211-001
```

The relevant test source is:

```ts
it("V211-001 rejects a null app healthcheck override", () => {
  const root = fixture({ app: {}, prod: { "override-compose": "prod.yml" } }, {
    "prod.yml": { services: { app: { healthcheck: null } } },
  });
  expect(() => compileService("prod", root)).toThrow(/healthcheck/i);
});
```

The shared file calls `cleanupFixtures` in `afterEach`. **Observed red:** the compiler returned normally, so Vitest reported `expected [Function] to throw an error`. The V211-001 control, which uses `{ interval: "5s" }`, passed. If the red assertion passes on the implementer's branch before editing source, do not make this fix; record the commit and passing output. A test infrastructure failure must be repaired and rerun before making a bug decision.

## Exact implementation change

Edit the healthcheck branch in `src/core/composition/validateOverrideCompose.ts`, immediately after the forbidden app-key loop. Replace the truthiness guard with an explicit presence check and shape validation. Keep the existing key restriction.

```ts
if (Object.hasOwn(app, "healthcheck")) {
  const healthcheck = app.healthcheck;
  if (
    healthcheck === null ||
    typeof healthcheck !== "object" ||
    Array.isArray(healthcheck)
  ) {
    fail(
      "services.app.healthcheck",
      "override healthcheck must be a mapping of timing fields",
      healthcheck,
    );
  }

  const allowedTiming = new Set([
    "interval", "timeout", "retries", "start_period", "start_interval",
  ]);
  for (const key of Object.keys(healthcheck as Record<string, unknown>)) {
    if (!allowedTiming.has(key)) {
      fail(
        `services.app.healthcheck.${key}`,
        "override may set only healthcheck timing fields",
      );
    }
  }
}
```

Do not make `null` mean “inherit.” V2 has no generic deletion syntax, and normalizing it silently would hide a configuration error. Do not add a synthetic healthcheck: the Dockerfile supplies the app command and policy validates it.

## Green verification and controls

1. Run the same `-t V211-001` command. Both the red assertion and the timing-only control should pass.
2. Add table-driven negative cases to `tests/conformance/v211-audit.test.ts` for `[]`, `"disabled"`, and `{ disable: true }`. The existing `{ disable: true }` conformance case should remain green.
3. Add a positive case with `{ timeout: "2s", retries: 3 }`, ideally applied after a `prod` timing override and then an `e2e` timing override, to prove inherited maps still merge. The existing `v210-compose-overlay-merge.test.ts` already covers the merge and should stay green.
4. Run `pnpm exec vitest run tests/conformance/v211-audit.test.ts tests/conformance/v210-compose-overlay-merge.test.ts tests/conformance/03-stages.test.ts` and `pnpm typecheck`.

The fix is complete when the original invalid override fails before Docker and the permitted timing-only overlays retain their current behavior.

## Implementation record — 2026-10-12

The V211-001 regression failed before the source change because `validateAndPrepareAppOverride` only checked `app.healthcheck` when truthy, allowing `null`, array, and non-object values to bypass validation and corrupt the compiled Compose output. After the change, declaring `healthcheck` in an override requires a non-null mapping of timing fields.

In `src/core/composition/validateOverrideCompose.ts`, `Object.hasOwn(app, "healthcheck")` now explicitly verifies that `app.healthcheck` is a non-null, non-array object before validating that its keys only contain allowed timing fields (`interval`, `timeout`, `retries`, `start_period`, `start_interval`).

The test suite in `tests/conformance/v211-audit.test.ts` covers:
- Rejection of `healthcheck: null`.
- Acceptance of valid timing-only overrides (e.g. `{ interval: "5s" }`).
- Rejection of array, string, and disable flag healthchecks.
- Preservation of timing field merging across `prod` and `e2e` stages.

Validation: All V211-001 tests passed, and stage/overlay conformance suites passed.
