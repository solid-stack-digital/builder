# 01 — Redact explicit mesh test-unit debug output

## Bug report

**Bug.** `builder mesh up test-unit --debug` writes the compiled Compose YAML directly to stdout. An environment variable such as `API_TOKEN` appears with its plaintext value. The sibling mesh dev, prod, and E2E runners and the standalone unit runner redact their debug YAML. The [public CLI reference](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/docs/reference/cli.md:71) promises secret redaction for mesh `--debug` output.

**Why this is a bug.** Mesh JSON §5.1 allows composition-owned app env values, including credentials. V2 §31 says users may supply secrets through env and that Builder is not a secret manager; printing the exact value during an ordinary documented debug flow exposes it through terminal capture, CI logs, or bug reports. This is also a direct mismatch between the documented `--debug` behavior and the explicit test-unit runner. The task is to apply the repository's existing debug-output redactor, with the same limits as other runners, rather than to invent a new secrets subsystem.

**Cause.** [runMeshTestUnit.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/runners/runMeshTestUnit.ts:5) has `if(options.debug)console.log(yaml)` after assigning the fully resolved app environment. [runMeshTestE2e.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/runners/runMeshTestE2e.ts:3) and [runTestUnit.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/runners/runTestUnit.ts:24) use `redactYamlSecrets` at the equivalent output boundary.

**Expected behavior.** Debug mode still prints the useful compiled YAML, but sensitive values identified by the existing `redactYamlSecrets` policy are masked. The original unredacted YAML is still passed internally to Compose when executing. Non-debug mode prints no YAML or secret.

## Red test and proceed-or-skip gate

Copy the [shared reproduction](reproductions/v214-audit.test.ts.txt) as instructed in the [index](00-audit-index.md), then run before edits:

```bash
pnpm exec vitest run tests/conformance/v214-audit.test.ts -t V214-001
```

The red test uses the real dry-run test-unit runner, spies on `console.log`, and makes the secret unmistakable:

```ts
const secret = "SENTINEL_TOP_SECRET_214";
const root = meshFixture(
  { services: { api: { path: "api", env: { API_TOKEN: secret } } } },
  { api: { app: {} } },
);
const log = vi.spyOn(console, "log").mockImplementation(() => {});
expect(await runMeshTestUnit({ projectDir: root, debug: true, dryRun: true })).toBe(0);
const output = log.mock.calls.flat().join("\n");
expect(output).toContain("API_TOKEN");
expect(output).toContain("********");
expect(output).not.toContain(secret);
```

**Observed red:** the output includes `API_TOKEN: SENTINEL_TOP_SECRET_214` and no `********`. The companion no-debug control passes. This is a behavioral failure; the runner completed normally and no container ran. If this assertion is already green on the implementer's branch, **skip the fix** and record commit/output. If it fails because the test cannot import or create its fixture, repair the harness and rerun before deciding.

## Exact source change

In `src/core/mesh/runners/runMeshTestUnit.ts`, import the same helper already used by other runners:

```ts
import { redactYamlSecrets } from "../../../utils/redactSecrets.js";
```

Replace only the debug print immediately after `const yaml=stringify(compiled.compose)`:

```diff
-if(options.debug)console.log(yaml);
+if (options.debug) {
+  console.log(
+    pc.yellow("\nFinal explicit mesh test-unit YAML configuration:\n"),
+    redactYamlSecrets(yaml),
+  );
+}
```

The file is currently compressed into long lines. The implementer may reformat the surrounding block for readability, but should keep `yaml` itself unmodified for `teardownCompose`, `runCompose`, and optional debugging. Do not redact `app.environment` before composing: that would send masked credentials into the container and change runtime behavior.

## Green verification and controls

1. Rerun the exact `-t V214-001` command. Both the red assertion and non-debug control must pass. The assertion requires the YAML/key still to be present, the mask to appear, and the original sentinel to be absent.
2. Add or keep a unit control for `redactYamlSecrets` with a token key and a password embedded in a URL, matching the repository's established redaction policy. Avoid claiming this heuristic can identify arbitrary secret names.
3. Run `pnpm exec vitest run tests/conformance/v214-audit.test.ts tests/conformance/11-system-orchestration.test.ts tests/cli.test.ts`, then `pnpm typecheck` and the full suite.
4. Inspect stdout from `builder mesh up test-unit --dry-run --debug` against a disposable fixture with a fake token. Never use a real credential in this check. Ensure the YAML remains useful and the fake token is absent.

Retain the regression file in `tests/conformance/` after the source fix. Public docs already state the intended behavior; no docs edit is needed if the code now fulfills it.
