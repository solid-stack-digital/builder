# 02 — Deep-merge inherited app Compose maps

**ID:** V210-002. **Priority:** Medium. **Status:** two reproduced cases. **Fix not applied.**

## Bug and expected behavior

A service's prod override sets healthcheck timing or logging options. Its E2E override sets only one additional field in that same map. Compilation uses `{ ...app, ...preparedApp }`, replacing the entire inherited map. E2E loses production timeout/retry/interval settings or logging driver/options that it did not override.

Expected: objects merge recursively, omitted fields inherit, scalars replace, and ordinary arrays replace. In the healthcheck reproduction, all prod timing values must survive alongside the E2E `start_period`. This does not authorize overriding the Dockerfile healthcheck command.

## Specification and source

- `SPECS_V2.md` §§2.4, 12 and 21: E2E inherits prod, maps deep-merge, omitted fields inherit, and prod/e2e Compose overlays both participate in order.
- `BUILD_JSON_DOCS.md` §10.1 describes stage override Compose; app env layering has its own explicit precedence in §3.2.
- [compileServiceComposition.ts](../../../../src/core/composition/compileServiceComposition.ts), around line 86: `const merged={...app,...preparedApp};`.
- [validateOverrideCompose.ts](../../../../src/core/composition/validateOverrideCompose.ts) permits healthcheck timing fields, so the reproduction uses valid accepted inputs.

The existing special merges for environment, build args, and networks do not cover healthcheck, logging, or other permitted nested runtime maps.

## Exact regression test

Place these cases in `tests/conformance/v210-audit-gates.test.ts` using the supplied artifact, or use the complete snippet below at that path.

```ts
import { afterEach, expect, it } from 'vitest';
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, meshFixture, ownerBundle } from './fixture.js';
afterEach(cleanupFixtures);

it('V210-002 preserves inherited healthcheck timing in E2E', () => {
  const root = fixture({ app: {}, prod: { 'override-compose': 'prod.yml' }, e2e: { 'override-compose': 'e2e.yml' } }, {
    'prod.yml': { services: { app: { healthcheck: { interval: '3s', timeout: '2s', retries: 7 } } } },
    'e2e.yml': { services: { app: { healthcheck: { start_period: '20s' } } } },
  });
  expect(compileService('e2e', root).compose.services.app!.healthcheck).toEqual({ interval: '3s', timeout: '2s', retries: 7, start_period: '20s' });
});

it('V210-002 preserves inherited nested logging options', () => {
  const root = fixture({ app: {}, prod: { 'override-compose': 'prod.yml' }, e2e: { 'override-compose': 'e2e.yml' } }, {
    'prod.yml': { services: { app: { logging: { driver: 'json-file', options: { 'max-size': '20m', 'max-file': '5' } } } } },
    'e2e.yml': { services: { app: { logging: { options: { 'max-size': '1m' } } } } },
  });
  expect(compileService('e2e', root).compose.services.app!.logging).toEqual({ driver: 'json-file', options: { 'max-size': '1m', 'max-file': '5' } });
});


```

```bash
pnpm exec vitest run tests/conformance/v210-audit-gates.test.ts -t V210-002
```

Observed healthcheck: `{ start_period: '20s' }`; missing `interval`, `timeout`, `retries`. Observed logging: `{ options: { 'max-size': '1m' } }`; missing `driver` and `max-file`.

**Gate:** both assertions should fail by losing inherited fields. If they pass before source edits, skip this fix. A rejected YAML fixture is not the expected failure.

## Proposed implementation

Create `src/core/composition/mergeAppOverride.ts`:

```ts
import type { ComposeService } from './types.js';

type PlainMap = Record<string, unknown>;
function isMap(value: unknown): value is PlainMap {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mergeValue(inherited: unknown, overlay: unknown): unknown {
  if (overlay === undefined) return structuredClone(inherited);
  if (!isMap(inherited) || !isMap(overlay)) return structuredClone(overlay);
  // Object.fromEntries defines own properties safely, including unusual map keys.
  return Object.fromEntries(
    [...new Set([...Object.keys(inherited), ...Object.keys(overlay)])].map(key => [
      key,
      Object.hasOwn(overlay, key)
        ? mergeValue(inherited[key], overlay[key])
        : structuredClone(inherited[key]),
    ]),
  );
}

export function mergeAppOverride(
  inherited: ComposeService,
  overlay: ComposeService,
): ComposeService {
  return mergeValue(inherited, overlay) as ComposeService;
}
```

Import this function in `compileServiceComposition.ts`. Replace only the shallow app/overlay merge:

```ts
const merged = mergeAppOverride(app, preparedApp);
```

Keep the existing validation and the explicit Builder-owned assignments immediately after it. `preparedApp.environment` and `preparedApp.build` are already deleted before this point; their dedicated merge paths should continue to handle precedence and ownership. Preserve selected target/context, `env_file`, lifecycle, final internal environment, and the existing network attachment logic.

The helper must not concatenate command/entrypoint/volume arrays. It must not synthesize a healthcheck test or allow forbidden `healthcheck.disable`/`test` fields. Validation still runs before merging.

## Permanent controls

1. Scalar replacement: prod `restart: unless-stopped`, E2E `restart: 'no'` => `'no'`.
2. Array replacement: prod `command: ['old']`, E2E `command: ['new']` => only `['new']`.
3. Omitted whole map: prod health timings, E2E command only => identical inherited timing map.
4. Nested map overwrite: prod logging `max-size: 20m`, `max-file: '5'`; E2E `max-size: 1m` => expected merged result already covered.
5. No mutation: call the helper directly; verify both input objects remain equal to pre-call clones and nested output arrays/maps are not input references.
6. Mesh parity: create a single-service mesh with this same build and files; `compileMesh('e2e', root).compose.services.api.healthcheck` must equal the standalone result.
7. Ownership control: overrides containing `build.target`, `healthcheck.test`, `healthcheck.disable`, or `environment.EXEC_MODE` must still throw.
8. Existing env precedence cases must pass; do not resolve or escape override environment a second time.

## Files and verification

Change the new merge helper and `compileServiceComposition.ts`; retain the two red tests and add focused controls to the helper test or stage conformance suite. Run:

```bash
pnpm exec vitest run tests/conformance/v210-audit-gates.test.ts -t V210-002
pnpm exec vitest run tests/conformance/03-stages.test.ts tests/v2/serviceE2e.test.ts tests/v2/compileServiceComposition.test.ts tests/v2/compileMeshComposition.test.ts
pnpm typecheck
```

Run plan 00's final checks after all accepted fixes. The implementation expands deep merging to permitted runtime maps; review array/scalar controls carefully to avoid introducing a Compose-style sequence union where the Builder specification requires replacement.
