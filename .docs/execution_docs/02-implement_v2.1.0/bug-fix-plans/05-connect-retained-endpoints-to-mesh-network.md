# 05 — Make retained dependency endpoints reachable across the mesh

**ID:** V210-005. **Priority:** High. **Status:** implemented and verified on 2026-10-12. The original red test and implementation plan are preserved below.

## Bug and trigger

`mesh.json` explicitly supports references such as `${api.dependencies.db.endpoints.api.network_host}` in another mesh service's environment. The compiler resolves that reference to the generated dependency service name. However, that endpoint owner is attached only to dependency-private networks and `mesh--api`; the consuming `client` app is attached only to `mesh`. They share no network.

The resulting environment looks correct but names a service the consumer cannot reach through the generated network topology. This affects supported direct references to retained local dependency endpoints. It does not affect a normal app-to-app reference, because top-level apps already share `mesh`.

## Specification and implementation evidence

- `SPECS_V2.md` §10.2 supports direct references to another service's dependency endpoints from mesh env.
- §8 defines network host/address/URL as the endpoint's network surface; §§11 and 20 state environment references do not create lifecycle edges.
- `MESH_JSON_DOCS.md` §§5 and 9 document mesh references; retained local dependency publication is separately controlled by §4.4.
- [compileMeshComposition.ts](../../../../src/core/mesh/v2/compileMeshComposition.ts): `localDeps` loop attaches dependency services to a per-service private network, but app services to `mesh`.
- [meshReferences.ts](../../../../src/core/mesh/v2/meshReferences.ts): `resolveMesh` accepts and resolves retained dependency references without considering whether source and destination have a common network.

The reproduction first proves that the env host equals the registry's endpoint host, then checks connectivity structurally. This separates a network-assembly error from a reference-parsing error.

## Exact red test

```ts
import { afterEach, expect, it } from 'vitest';
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, meshFixture, ownerBundle } from './fixture.js';
afterEach(cleanupFixtures);

it.each(['dev', 'prod', 'e2e'] as const)('V210-005 makes cross-service retained endpoint reachable in %s', stage => {
  const root = meshFixture({ services: {
    api: { path: 'api' }, client: { path: 'client', env: { DB_HOST: '${api.dependencies.db.endpoints.api.network_host}' } },
  }, tester: { compose: 'tester.yml', service: 'runner' } }, {
    api: { app: {}, dependencies: { db: dep('db.yml') } }, client: { app: {} },
  }, { 'api/db.yml': ownerBundle(), 'tester.yml': { services: { runner: { image: 'alpine', command: ['true'] } } } });
  const result = compileMesh(stage, root);
  const host = env(result.compose.services.client).DB_HOST!;
  expect(host).toBe(result.endpoints.dependencies.api!.db!.api!.networkHost);
  const networks = (name: string) => Object.keys(result.compose.services[name]!.networks as object);
  expect(networks('client').some(network => networks(host).includes(network))).toBe(true);
  expect(result.compose.services.client!.depends_on ?? {}).not.toHaveProperty(host);
  expect(result.compose.services[host]!.ports ?? []).toEqual([]);
});

```

```bash
pnpm exec vitest run tests/conformance/v210-audit-gates.test.ts -t V210-005
```

Observed: all three stages resolve the host successfully, then fail `expected false to be true` for common-network membership. No Docker connection attempt was performed. Network names in this test come from the final compiled document, not hardcoded generated-name assumptions.

**Gate:** if the services already share a network, this defect is not reproduced and the fix must not proceed. A missing endpoint error is not this defect.

## Expected behavior and fix choice

Attach every retained endpoint-owning dependency service to the shared mesh network, preserving its private dependency networks. This makes the exposed logical dependency surface reachable by mesh applications while helper-only services retain their private networks. A network attachment does not publish a host port, and does not create a `depends_on` edge.

The specification does not promise that retained endpoint owners are isolated from other mesh applications. It explicitly permits those applications to reference their network endpoints. The shared mesh is therefore the direct implementation choice. If an additional network access-control requirement is introduced later, use reference-aware network attachment as a separate feature rather than returning unusable endpoint properties.

## Exact code change

In `src/core/mesh/v2/compileMeshComposition.ts`, locate the existing loop that connects dependency endpoint owners to `privateName`. Expand its body to attach both networks:

```ts
for (const dep of localDeps) {
  for (const ep of Object.values(fragment.endpoints.dependencies[dep] ?? {})) {
    const ownerService = compose.services[ep.networkHost];
    if (ownerService) {
      attachNetworkIfCompatible(ownerService, privateName);
      attachNetworkIfCompatible(ownerService, 'mesh');
    }
  }
  // Every implementation service still participates in its consumer's private network.
  for (const generated of fragment.dependencyServiceNames?.[dep] ?? []) {
    const ownerService = compose.services[generated]!;
    attachNetworkIfCompatible(ownerService, privateName);
  }
}
```

Use the existing `attachNetworkIfCompatible` helper so array/map network forms normalize consistently. The dependency validator already rejects `network_mode` on endpoint owners. Do not add shared mesh membership in the helper-only loop. Do not add original unqualified service aliases to `mesh`; generated service DNS names prevent collisions when several dependencies use an internal owner called `owner` or `db`.

No reference resolver changes are necessary: the generated host is already correct. No endpoint publication changes are necessary. No new lifecycle edges are necessary.

## Permanent controls

1. All three stage regressions pass without changing env-reference assertions.
2. Host-private control: endpoint has no `publicPort` and no `publish`; final dependency service has no `ports`. Already asserted in the red tests.
3. Lifecycle control: `client` gets no new dependency edge merely because its env references an endpoint. Already asserted after the connectivity check; retain that assertion after fixing.
4. Helper privacy: use `ownerBundle({helper:{image:'alpine'}})` and assert helper's network keys do not contain `mesh`; owner keys do.
5. Two dependencies using the same source service name: generated hosts differ, both are on mesh, neither receives the other's original name as a shared-network alias.
6. Multiple endpoints on one owner: repeated attachment is idempotent; one `mesh` map entry.
7. Custom dependency networks with aliases: preserve existing namespaced networks, options, and aliases; add `mesh: null` without replacing the map.
8. Substitution: substituted local bundle still disappears entirely and the reference resolves to the provider app already on mesh.
9. Same-consumer local dependency access: original consumer app remains attached to its private network; existing behavior is preserved.

Example helper assertion after compiling a fixture with a helper service:

```ts
const helperName = Object.keys(result.compose.services)
  .find(name => name.endsWith('--helper'))!;
expect(result.compose.services[helperName]!.networks).not.toHaveProperty('mesh');
expect(result.compose.services[host]!.networks).toHaveProperty('mesh');
```

For production tests, prefer locating helper names through compiler metadata if generated-name formatting changes; the suffix assertion above is suitable only for a controlled fixture with no name collision.

## Verification and runtime limit

Run the gate, mesh composition/substitution/lifecycle tests, and plan 00's final checks. A later Docker acceptance test should start a disposable dependency HTTP server and a second app that calls the resolved host, with zero host ports. Assert successful connection and absence of automatically generated lifecycle edges.

The audit establishes the absent shared network. A successful socket request is a recommended runtime acceptance check after implementation, not an already observed audit result. The change broadens mesh-internal reachability for logical endpoint owners only; it does not expose helper-only services or host ports.

## Implementation record — 2026-10-12

All three V210-005 regressions failed before the source change because endpoint-owning dependency services were attached only to `mesh--<service>` and not to the shared `mesh` network, making resolved hosts unreachable from other mesh services. After the change, all three stages (dev, prod, e2e) pass.

In `src/core/mesh/v2/compileMeshComposition.ts`, the dependency endpoint owner attachment loop now calls `attachNetworkIfCompatible(ownerService, "mesh")` in addition to the private network. Helper-only implementation services remain attached strictly to `mesh--<service>` and do not receive mesh membership. No host ports are exposed and no depends_on edges are generated.

The permanent test suite `tests/conformance/v210-retained-endpoints.test.ts` covers the three stage regressions, helper privacy preservation, distinct hosts and absence of shared-network aliases for collision candidates, idempotent multi-endpoint attachment, preservation of custom namespaced dependency networks and aliases, substituted dependency resolution, and consumer private network preservation.

Validation: 150 related tests passed, 537 conformance tests passed, 773 full-suite tests passed, TypeScript check passed, and removed-V1-token check passed. No live Docker acceptance run was performed. Plans 06–07 remain separate work.
