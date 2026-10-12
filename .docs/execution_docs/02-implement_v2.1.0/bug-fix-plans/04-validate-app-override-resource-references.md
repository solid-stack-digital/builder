# 04 — Reject undefined app override resources before runtime

**ID:** V210-004. **Priority:** Medium. **Status:** four reproduced invalid configurations. **Fix not applied.**

## Bug and impact

A validly shaped app override can refer to a named volume, network, config, or secret that has no top-level definition. `validateAndPrepareAppOverride` collects resource references to reject unused definitions, but never checks the reverse: whether each reference has a definition. References with no allocated name are retained unchanged. The final standalone compiler returns invalid Compose successfully.

Example accepted today:

```yaml
services:
  app:
    volumes: [missing:/data]
```

Expected: Builder raises a `ConfigError` identifying `services.app.volumes`, the resource `missing`, the override file, and the active stage. Equivalent undefined networks/configs/secrets must also fail. Bind mounts and anonymous volumes are not named resource references and remain valid.

## Specification and code

- `SPECS_V2.md` §1 invariant 2 requires invalid or unresolved declarations to fail before runtime whenever possible.
- §21 permits app override runtime details and resources, subject to Builder validation and ownership.
- `BUILD_JSON_DOCS.md` §10.1 describes supported app override volumes/settings; acceptance must produce usable effective composition.
- [validateOverrideCompose.ts](../../../../src/core/composition/validateOverrideCompose.ts), resource loop: validates `defs -> refs`, but not `refs -> defs`.
- [validateComposeResourceReferences.ts](../../../../src/core/composition/validateComposeResourceReferences.ts) already implements the missing check and is used for dependencies/testers.
- [compileServiceComposition.ts](../../../../src/core/composition/compileServiceComposition.ts) does not currently invoke a final resource-reference validator.

Docker may reject this later, but that does not make Builder's successful compile/check result correct. This report concerns deterministic validation of the configuration before a runtime invocation.

## Exact red tests and decision

```ts
import { afterEach, expect, it } from 'vitest';
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, meshFixture, ownerBundle } from './fixture.js';
afterEach(cleanupFixtures);

it.each([
  ['volumes', ['missing:/data']], ['networks', ['missing']], ['configs', ['missing']], ['secrets', ['missing']],
])('V210-004 rejects undefined app override %s', (kind, value) => {
  const root = fixture({ app: {}, prod: { 'override-compose': 'override.yml' } }, { 'override.yml': { services: { app: { [kind as string]: value } } } });
  expect(() => compileService('prod', root)).toThrow(/reference.*missing|missing.*definition/i);
});


```

```bash
pnpm exec vitest run tests/conformance/v210-audit-gates.test.ts -t V210-004
```

Observed: all four calls returned normally; each expected a missing-resource error. **Proceed only** when the valid harness accepts an undefined resource. If Builder already rejects it, do not apply this fix. If the error is unrelated to the missing resource, repair the fixture first.

## Proposed implementation

Reuse the existing validator; avoid writing another parser for short/long volumes or config/secret entries.

At the top of `validateOverrideCompose.ts`:

```ts
import { validateComposeResourceReferences } from './validateComposeResourceReferences.js';
```

After validating allowed root keys and exactly one `app` service, but **before** cloning/namespacing resource references, add:

```ts
validateComposeResourceReferences(document, {
  sourceFile: context.file,
  stage: context.stage,
  composition: 'service',
});
```

Call on the original override document so diagnostics use the user's keys, not generated names. The validator already recognizes bind mounts, anonymous volumes, short/long references, and implicit `default` networking.

For this plan, each override document's explicit resource references must resolve to definitions in that document (except Compose's implicit `default`). That is the existing resource allocation model: each override's definitions are independently namespaced by stage. This change should not claim to add support for E2E raw references to prod-local resource keys; that requires a separate inheritance/name-resolution design.

An optional final validation pass can detect internal compiler defects, but do not run it blindly on a mesh fragment: fragments may rely on mesh networks attached later by `compileMeshComposition`. The necessary fix here is source-document validation at the app override boundary. If final validation is added, place it only after final network/resource assembly and retain source-aware validation above.

## Tests to retain and add

Keep the four failing cases as regression tests. Add these controls using the same fixture helper:

```ts
it('accepts declared app volume and rewrites its reference', () => {
  const root = fixture({ app: {}, prod: { 'override-compose': 'o.yml' } }, {
    'o.yml': { services: { app: { volumes: ['data:/data'] } }, volumes: { data: {} } },
  });
  const compiled = compileService('prod', root).compose;
  const [key] = Object.keys(compiled.volumes!);
  expect(compiled.services.app!.volumes).toEqual([`${key}:/data`]);
});

it('accepts bind mounts, anonymous volumes, and implicit default network', () => {
  const root = fixture({ app: {}, prod: { 'override-compose': 'o.yml' } }, {
    'o.yml': { services: { app: {
      volumes: ['./data:/data', '/cache'], networks: ['default'],
    } } },
  });
  expect(() => compileService('prod', root)).not.toThrow();
});
```

Also cover:

| Control | Expected |
|---|---|
| Long volume `{type:'volume', source:'missing', target:'/data'}` | rejects missing definition |
| Long config/secret `{source:'missing', target:'/run/value'}` | rejects missing definition |
| Network map `{missing:null}` | rejects |
| Declared config/secret with a local file | accepted and source namespaced |
| Declared external resource | accepted; plan 03 preserves external identity |
| Unused definition | existing unused-resource error remains |
| Mesh app override missing resource | same source-aware failure before runtime |
| Valid E2E overlays declaring their own resources | inherited and active definitions still compile |

## Completion

Run the exact gate, stage override/conformance tests, path-boundary tests, and plan 00's final checks. Source change is limited to `validateOverrideCompose.ts` plus permanent tests. No schema update is necessary. Check error output includes file/stage/reference and does not dump secret content.
