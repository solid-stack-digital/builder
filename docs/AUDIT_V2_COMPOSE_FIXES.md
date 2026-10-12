# V2 Compose re-audit execution

Each proposed gate was added and run individually against production code before its fix. All fourteen findings reproduced; none were classified NOT REPRODUCED. The A04–A06 naming/ownership implementation was grouped after all three gates failed. A07 was confirmed before updating that same networking loop.

| Item | Intended pre-fix failure observed | Result |
| --- | --- | --- |
| A01 | Invalid build endpoint reference for raw Compose API_TOKEN | CONFIRMED + FIXED |
| A02 | Bare environment became an empty string instead of null | CONFIRMED + FIXED |
| A03 | All five unsupported override cases compiled without throwing | CONFIRMED + FIXED |
| A04 | Mesh override volume name collision | CONFIRMED + FIXED |
| A05 | Internal service namespace collision for delimiter-ambiguous identities | CONFIRMED + FIXED |
| A06 | ONLY_A leaked into the a--b dependency | CONFIRMED + FIXED |
| A07 | Namespace-sharing helper acquired a networks field | CONFIRMED + FIXED |
| A08 | Numeric healthcheck test did not throw | CONFIRMED + FIXED |
| A09 | Dependency profiles compiled without throwing | CONFIRMED + FIXED |
| A10 | Inherited endpoint-owner network_mode compiled without throwing | CONFIRMED + FIXED |
| A11 | All five remote context schemes were rebased as local paths | CONFIRMED + FIXED |
| A12 | Dependency build secret remained unrenamed; tester build-only secret was omitted | CONFIRMED + FIXED |
| A13 | Tester helper dependency edge was missing | CONFIRMED + FIXED |
| A14 | Generated service map propertyNames was undefined | CONFIRMED + FIXED |

The additional-context inspection under A12 confirmed three further gates: dependency map/list service references and tester service references compiled without rejection. These unsupported forms now fail explicitly.

All original gate failures were at the intended assertion or ConfigError mismatch. No fixture corrections were needed. Each focused post-fix run and its owning conformance tests passed. Additional controls cover mesh environment precedence, dependency overlays, cross-fragment/app naming collisions and repeatability, valid/invalid healthchecks, long build-secret syntax, and schema provider/lifecycle constraints.

## Implementation decisions

- Environment provenance remains explicit through standalone, mesh, mesh checks, and isolated mesh unit execution.
- Names use structured JSON identities and a composition-wide occupied-name set. This uses the audit's collision-aware allocation option: an available readable hint is retained; collisions get SHA-256-derived suffixes. Sorted allocation and reserved app/network names keep compilation deterministic. Dependency ownership is never parsed from generated names.
- Override resources use the same allocator with service-qualified identities. Merge guards and final allocator assertions reject internal collisions.
- Dependency extends is rejected; the prior tests asserting partial inheritance support were replaced. No partial Compose inheritance implementation remains in dependency namespacing.
- The schema generator derives its service-name pattern and reserved list from runtime constants. Generated schemas were regenerated rather than hand-edited.
- The already-fixed nested override context behavior remains intact.

The full unit suite exposed five older mesh tests whose raw YAML healthcheck command used an unquoted boolean `true`. Those fixtures now quote the command argument so they remain valid Compose and reach their intended mesh assertions. Production healthcheck validation was not relaxed.

## Verification

All required verification completed successfully:

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS |
| Focused audit, schema, stage, dependency, mesh-env, and global-tester files | PASS |
| `pnpm test:conformance` | PASS — 462 tests, 16 files |
| `pnpm test` | PASS — 623 tests, 50 files |
| `pnpm build:schemas` | PASS |
| `pnpm build` | PASS |
| `pnpm check:v2-no-legacy` | PASS |
| `pnpm test:docker` | PASS — 40 tests, 8 files |
| `pnpm prepublishOnly` | PASS, including package dry-run validation |
| `git diff --check` | PASS |

Docker was available and acceptance ran against the daemon. Expected negative Dockerfile-policy diagnostics appeared inside passing rejection tests. No release was published.
