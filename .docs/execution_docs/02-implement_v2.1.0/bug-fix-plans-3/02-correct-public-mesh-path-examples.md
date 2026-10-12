# 02 — Correct public mesh examples that point outside the mesh project

## Documentation bug report

**Bug.** Ten public `docs/` pages use mesh service paths such as `"path": "../frontend"`, `"path": "../backend"`, or `"path": "../fake-payments"`. With `mesh.json` in the documented mesh project, those paths resolve outside that project's directory. Builder rejects them before it can run the advertised mesh, so the quickstart and recipes are not copyable examples of a real feature.

**Why it is a bug.** V2 §4 lists project-escaping paths among fail-fast errors, Mesh JSON §4.1 requires `services.<name>.path` to meet Builder path-safety rules, and [resolveInsideProject.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/pathSafety.ts) rejects a path escaping its project root. Service independence does not require a sibling directory; a service can remain an independent project inside a mesh root. The public examples promise a supported layout that their own required `builder mesh check` rejects.

**Observed evidence.** The `V213-D02` documentation test found these ten files with escaping JSON service paths:

```text
docs/concepts/dependency-substitution.md
docs/getting-started/mesh-quickstart.md
docs/guides/bind-dependencies-to-real-services.md
docs/guides/configure-global-mesh-e2e.md
docs/guides/publish-mesh-endpoints.md
docs/recipes/composition-owned-gateway-wiring.md
docs/recipes/public-gateway-private-services.md
docs/recipes/real-service-replaces-local-mock.md
docs/recipes/stage-only-e2e-provider.md
docs/reference/mesh-json.md
```

The paired control passes: `resolveInsideProject("/tmp/mesh", "../frontend", ...)` throws a project-escape error. This is a **documentation correction**, not permission to loosen path safety or silently remap the user's path.

**Expected documentation.** Every example service `path` stays within the directory containing `mesh.json`. The quickstart and complete reference example explicitly show the assumed directory layout, so readers can place independent service projects at the paths shown. Links such as Markdown `../concepts/...` and `$schema` URIs are separate kinds of paths and should not be changed by this plan.

## Red test gate

Install the shared [V213 reproduction](reproductions/v213-audit.test.ts.txt) at `tests/conformance/v213-audit.test.ts` as instructed in the [index](00-audit-index.md). Then run:

```bash
pnpm exec vitest run tests/conformance/v213-audit.test.ts -t V213-D02
```

The relevant test scans only JSON `"path": "../..."` examples in public Markdown:

```ts
const offenders = readdirSync("docs", { recursive: true })
  .filter((file): file is string => typeof file === "string" && file.endsWith(".md"))
  .filter(file => /"path"\s*:\s*"\.\.\//.test(
    readFileSync(path.join("docs", file), "utf8")));
expect(offenders).toEqual([]);
```

**Observed red:** the assertion reports the ten files above; the runtime path-rejection control passes. If the docs assertion is green before edits, this mismatch has already been corrected on that branch: **do not apply the replacements**. If the test cannot read `docs/`, run it from the repository root or repair the harness, then rerun before deciding.

## Exact edit plan

In the ten files listed above, replace **JSON service path values only**:

```text
"path": "../frontend"      -> "path": "./services/frontend"
"path": "../backend"       -> "path": "./services/backend"
"path": "../gateway"       -> "path": "./services/gateway"
"path": "../fake-payments" -> "path": "./services/fake-payments"
```

A narrowly scoped editing script is acceptable; inspect its diff before keeping it:

```python
from pathlib import Path
import re

for file in Path("docs").rglob("*.md"):
    original = file.read_text()
    updated = re.sub(
        r'("path"\s*:\s*")\.\./(frontend|backend|gateway|fake-payments)(")',
        r'\1./services/\2\3',
        original,
    )
    if updated != original:
        file.write_text(updated)
```

Add a layout note immediately before the JSON block in `docs/getting-started/mesh-quickstart.md`, and a similar shorter note before the complete example in `docs/reference/mesh-json.md`:

```text
mesh-project/
  mesh.json
  services/
    frontend/
      build.json
      Dockerfile
    backend/
      build.json
      Dockerfile
```

Explain that these are independently runnable service projects whose directories happen to be nested under the mesh project. Do not claim arbitrary sibling `../` paths are supported. Do not change `resolveInsideProject` or the normative path-safety contract to accommodate the old examples.

## Green checks

1. Rerun the exact `-t V213-D02` gate. Both the documentation assertion and path-rejection control must pass.
2. Run `rg -n '"path": "\.\./' docs` and verify no mesh service example remains. Inspect any match manually rather than changing unrelated Markdown links.
3. Parse the quickstart and complete-reference JSON snippets and confirm they are valid JSON with the new paths. For an integration control, create a disposable mesh root containing `services/frontend` and `services/backend` fixture projects, then compile `mesh dev` with those paths; it must not raise a path-escape error.
4. Run the documentation checks and `pnpm test:conformance`. Report any remaining prerequisites (provider endpoint names, Dockerfile, local dependency implementation) as explicit assumptions in the example rather than changing Builder behavior.
