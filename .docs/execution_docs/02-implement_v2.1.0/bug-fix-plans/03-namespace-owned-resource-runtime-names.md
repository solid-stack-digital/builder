# 03 — Namespace physical resource names, not only Compose keys

**ID:** V210-003. **Priority:** High. **Status:** reproduced for volumes, networks, configs, and secrets. **Fix not applied.**

## Bug and trigger

Two dependency bundles each declare a resource such as:

```yaml
volumes:
  shared:
    name: globally-shared
```

Builder correctly changes the Compose keys to distinct generated names and rewrites service references. It retains `name: globally-shared` in both definitions. Explicit names identify the actual resource independently of the generated Compose key. Thus two supposedly independent resources still identify the same object. The same issue applies to resource definitions passed through tester namespacing and app override resource allocation.

For volumes, unintended sharing can leak data across independent dependencies or projects. For networks, distinct dependency networks can become one physical network. Config/secret names can collide instead of naming independent resources. The audit proves duplicated runtime identities in compiled output; it did not create Docker resources or observe data loss.

## Specification and source

- `SPECS_V2.md` §§16–17 require namespacing of owned services/resources when dependency implementations materialize.
- `BUILD_JSON_DOCS.md` §5.2 says Builder namespaces dependency-owned objects and rewrites internal references consistently.
- Global test isolation is additionally affected when resource identities escape project/stage scope (`SPECS_V2.md` §29).
- [namespaceDependencyCompose.ts](../../../../src/core/composition/namespaceDependencyCompose.ts): `rewriteKeys` changes keys but leaves resource definition values intact.
- [validateOverrideCompose.ts](../../../../src/core/composition/validateOverrideCompose.ts): `mapped[target] = definition` has the same problem for app resources.
- [compileMeshTester.ts](../../../../src/core/mesh/v2/compileMeshTester.ts) reuses dependency namespacing.

## Exact red tests

The tests compute effective resource identity as explicit `name`, otherwise project-prefixed generated key. They deliberately use non-external resources; externally owned resources need a different treatment.

```ts
import { afterEach, expect, it } from 'vitest';
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, meshFixture, ownerBundle } from './fixture.js';
afterEach(cleanupFixtures);

it.each(['volumes', 'networks', 'configs', 'secrets'] as const)('V210-003 namespaces actual owned %s names', kind => {
  const refs = kind === 'volumes' ? ['shared:/data'] : ['shared'];
  const definition = { name: 'globally-shared', ...(['configs', 'secrets'].includes(kind) ? { file: './data.txt' } : {}) };
  const bundle = { services: { owner: { image: 'alpine', healthcheck: { test: ['CMD', 'true'] }, [kind]: refs } }, [kind]: { shared: definition } };
  const root = fixture({ app: {}, dependencies: { first: dep('first.yml'), second: dep('second.yml') } }, { 'first.yml': bundle, 'second.yml': bundle, 'data.txt': 'fixture' });
  const result = compileService('prod', root);
  const actual = Object.entries(result.compose[kind] ?? {}).map(([key, value]) => (value as any)?.name ?? `${result.projectName}_${key}`);
  expect(new Set(actual).size).toBe(actual.length);
});


```

```bash
pnpm exec vitest run tests/conformance/v210-audit-gates.test.ts -t V210-003
```

Observed for each resource kind: two resource entries but only one distinct physical name (`expected 1 to be 2`). **Gate:** if names are already distinct, stop; do not change the namespacer merely because the source code looks suspicious.

## Expected behavior and chosen fix

Builder-owned resources must derive their actual names from the unique generated Compose key and Compose project. Remove a non-external definition's explicit `name`, retaining its other properties. This lets the existing project/stage identity scope it. Do not simply set `name` to the generated key: that still bypasses Compose's project prefix and can collide between standalone projects.

Resources marked `external: true` are intentionally outside Builder ownership. Preserve their external identity. If such a resource has no explicit `name`, capture its original key as `name` before renaming the key; otherwise namespacing changes which external object Compose looks up. This is a preservation control, not a demand that external resources be isolated or deleted by Builder.

## Implementation snippets

Create `src/core/composition/namespaceResourceDefinition.ts`:

```ts
export function namespaceResourceDefinition(
  originalKey: string,
  definition: unknown,
): unknown {
  if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) {
    return definition;
  }
  const result = structuredClone(definition) as Record<string, unknown>;
  if (result.external === true) {
    result.name ??= originalKey;
  } else {
    delete result.name;
  }
  return result;
}
```

In `namespaceDependencyCompose.ts`, import it and add a resource-specific map rewrite. Keep service `rewriteKeys` separate because service definitions are not resource definitions:

```ts
const rewriteResourceDefinitions = (obj: unknown, map: Map<string, string>) =>
  Object.fromEntries(entries(obj).map(([key, definition]) => [
    map.get(key) ?? key,
    namespaceResourceDefinition(key, definition),
  ]));

if (doc.volumes) doc.volumes = rewriteResourceDefinitions(doc.volumes, volumeNameMap);
if (doc.networks) doc.networks = rewriteResourceDefinitions(doc.networks, networkNameMap);
if (doc.configs) doc.configs = rewriteResourceDefinitions(doc.configs, configNameMap);
if (doc.secrets) doc.secrets = rewriteResourceDefinitions(doc.secrets, secretNameMap);
```

Replace the existing four resource `rewriteKeys` calls with these calls. Leave `doc.services = rewriteKeys(...)` and service/resource reference rewrites intact. Generated default networks use the same function and retain their existing options.

In `validateOverrideCompose.ts`, import the helper. Inside the existing resource definition allocation loop, replace:

```ts
mapped[target] = definition;
```

with:

```ts
mapped[target] = namespaceResourceDefinition(name, definition);
```

Tester resources automatically benefit because `compileMeshTester` calls the same namespacer. No schema changes or new `build.json` fields are needed.

## Permanent controls and extension cases

- Same dependency bundle materialized twice: physical names distinct and every service reference points to its own generated key (the red cases cover identities; add reference assertions).
- Two standalone projects using identical dependencies: owned resources have no explicit `name`; generated Compose project names differ, so effective names differ.
- Two mesh services each owning the same dependency: generated resource keys differ; no retained explicit shared `name`.
- Two app stage override resources named identically: each effective owned definition has no `name` and references remain correct.
- Tester helper resource with explicit non-external `name`: removed by the shared helper; selected runner still references generated key.
- External `{ external: true, name: 'existing-db' }`: retain both fields exactly.
- External `{ external: true }` with source key `shared`: keep `external: true`, add `name: 'shared'` even after generated key replacement.
- File configs/secrets: preserve rebased `file`; volume driver options and network `internal`/`ipam` maps survive.
- Null/empty resource definitions: preserve accepted shape; do not mutate input documents.
- Substituted dependency: still no owned local resource or service in final mesh.

Example helper controls:

```ts
expect(namespaceResourceDefinition('cache', { name: 'fixed', driver: 'local' }))
  .toEqual({ driver: 'local' });
expect(namespaceResourceDefinition('cache', { external: true }))
  .toEqual({ external: true, name: 'cache' });
expect(namespaceResourceDefinition('cache', { external: true, name: 'shared-cache' }))
  .toEqual({ external: true, name: 'shared-cache' });
```

These snippets assume `namespaceResourceDefinition` is imported from the proposed helper file.

## Verification and migration considerations

Run the gate, `tests/v2/dependencyCompose.test.ts`, `tests/v2/meshTester.test.ts`, dependency/substitution conformance suites, and plan 00's final checks. An optional Docker acceptance test can use two disposable dependency volumes, write different marker files, and assert separation.

Correcting an existing explicit owned name changes which runtime resource the project uses. Existing data does not automatically migrate. Do not delete or rename old Docker volumes in this code change. Document the behavior change for users who deliberately supplied global names; use `external: true` for explicitly shared external resources. The fix must never relabel an owned resource as external simply to preserve the accidental sharing.
