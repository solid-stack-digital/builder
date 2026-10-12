# 04 — Keep resolved env exports separate from runtime dotenv inputs

## Bug report

**Bug.** `builder service export env dev` writes the fully resolved app environment to `.env.dev`, which is also the runtime dotenv file read by `service up dev` and the service compiler. The export contains Builder-owned `EXEC_MODE`, `INFRA_MODE`, and, when an app primary endpoint exists, `PORT`. A later compilation rejects `.env.dev.EXEC_MODE` before the service can start. The export command therefore breaks the project it just exported.

**Why it is a bug.** The public [export guide](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/docs/guides/export-resolved-environment.md) and [CLI reference](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/docs/reference/cli.md) describe the command as a way to obtain the resolved app environment. V2 §11.2 requires Builder-owned runtime keys to remain authoritative and says a user-controlled lower layer trying to set them fails. The current compiler correctly rejects those keys in `.env.dev`; the export destination is wrong because it turns Builder's own snapshot into a user-controlled input on the next run. The four stage default destinations have the same problem.

**Cause and location.** [export handler](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/commands/service/commands/export/handler.ts:44) defaults to `path.join(projectDir, `.env.${snapshot.stage}`)`. [compileApplicationEnv.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/compileApplicationEnv.ts) includes Builder internal env in the snapshot. [builderEnvironment.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/builderEnvironment.ts) rejects those same keys when the snapshot is reloaded as stage dotenv.

**Expected behavior.** A full resolved export, including Builder-owned keys, is written to a **separate output artifact** that is never the active `.env.<stage>` input. The next compile/up of the same service still succeeds. Runtime dotenv and resolved snapshot retain distinct purposes. An interactive alternate destination equal to any `.env.dev`, `.env.prod`, `.env.test`, or `.env.e2e` must be rejected when writing a full resolved export, including a symlink alias if applicable. The command continues to prompt rather than overwrite an existing export silently.

## Red test gate

Install the shared [V213 reproduction](reproductions/v213-audit.test.ts.txt) at `tests/conformance/v213-audit.test.ts` using the [index](00-audit-index.md), then run:

```bash
pnpm exec vitest run tests/conformance/v213-audit.test.ts -t V213-004
```

Red case:

```ts
it("V213-004 default exported dev dotenv remains usable by service compilation", async () => {
  const root = fixture({ app: { endpoints: {
    http: http(3000, { publicPort: "AUTO" }),
  } } });
  await handleExportEnv("dev", { projectDir: root });
  expect(() => compileService("dev", root)).not.toThrow();
});
```

**Observed red:** the subsequent compiler throws `Environment file cannot set Builder-owned key "EXEC_MODE"` from `.env.dev`. The companion control passes and proves the exported snapshot really contains `EXEC_MODE`, `INFRA_MODE`, and `PORT`. The test uses local `docker compose config` through export but starts no container. If the red case passes on the implementation branch before editing, **do not apply this plan**; record the commit and output. Repair Docker CLI/import/fixture setup failures and rerun before deciding; those are not bug evidence.

## Exact implementation fix

Keep the full resolved snapshot content. Change the default destination to `.env.<stage>.resolved`, a file that Builder never auto-loads as `.env.<stage>`. In `src/commands/service/commands/export/handler.ts`, replace the initial filename assignment inside the snapshot loop:

```ts
// Before: path.join(projectDir, `.env.${snapshot.stage}`)
let filename = path.join(projectDir, `.env.${snapshot.stage}.resolved`);
```

Do not remove Builder-owned keys from `compileApplicationEnv`; that would make the “resolved app environment” snapshot incomplete. Do not relax the runtime dotenv ownership validation; it prevents user inputs from overriding Builder execution semantics.

Add a guard before writing, including after an interactive alternate name is chosen. Canonicalize with the existing `canonicalPath` helper so a symlink alias to a stage input is also caught. The guard should check all four stage input filenames, since a resolved dev snapshot must not poison a prod or E2E runtime file either:

```ts
import { canonicalPath } from "../../../../utils/paths.js";

const runtimeInputs = new Set(
  STAGES.map(stage => canonicalPath(path.join(projectDir, `.env.${stage}`))),
);
const assertSafeDestination = (candidate: string): void => {
  if (runtimeInputs.has(canonicalPath(candidate))) {
    throw new ScriptError(
      `Resolved env export cannot overwrite a runtime .env.<stage> input: ${candidate}`,
    );
  }
};

// Immediately before mkdirSync/writeFileSync, after all prompt decisions:
assertSafeDestination(filename);
```

Use the existing prompt flow for `.env.<stage>.resolved` collisions. When a user declines overwrite and supplies a new name, apply `assertSafeDestination` before creating directories or writing. The current code resolves alternate names relative to the project; keep that behavior. An optional improvement within this plan is to use `resolveInsideProject` for alternate names to prevent exports escaping the project, but do not conflate that with the required self-poison fix unless its own test is added.

Update `docs/reference/cli.md` and `docs/guides/export-resolved-environment.md` so the four default outputs are `.env.dev.resolved`, `.env.prod.resolved`, `.env.test.resolved`, and `.env.e2e.resolved`. Explain that `.env.<stage>` is runtime input and that the resolved export is an output snapshot. In the quickstart correction of plan 05, refer to `.env.dev.resolved`.

## Green verification and controls

1. Rerun the exact `-t V213-004` gate. Both the no-self-poison test and full-snapshot-content control must pass. Add an assertion that the returned path ends in `.env.dev.resolved` and that `.env.dev` was not created by the export.
2. Add a table-driven test for `dev`, `prod`, `test`, `e2e`: export each into a fresh fixture and compile the same stage again. For E2E use an app with a valid tester/endpoint configuration. Each exported filename must differ from its stage input.
3. Add an interactive-prompt adapter test choosing `.env.dev` as an alternate destination when `.env.dev.resolved` already exists. It must throw the targeted `ScriptError` before writing. Add a symlink-alias control if supported by the test platform.
4. Keep a control that confirms `EXEC_MODE`, `INFRA_MODE`, and `PORT` remain present in the resolved output. Keep existing export serialization and overwrite-prompt tests green.
5. Run `pnpm exec vitest run tests/conformance/v213-audit.test.ts tests/exportEnv.test.ts tests/compileApplicationEnv.test.ts`, `pnpm typecheck`, and the full suite. If an existing test asserts the old default filename, update it to the new documented output only after the red gate confirms the bug.

Users who previously exported to `.env.<stage>` may already have a poisoned runtime input. Document that they should move that snapshot aside or delete the Builder-owned lines before running the fixed command; do not silently rewrite their existing file during a read-only compile.

## Implementation record — 2026-10-13

`builder service export env` previously wrote output directly to `.env.<stage>`, which the service compiler subsequently loaded as a runtime input and rejected due to Builder-owned keys (`EXEC_MODE`, `INFRA_MODE`, and `PORT`).

1. Updated default export filenames in `src/commands/service/commands/export/handler.ts` to `.env.${snapshot.stage}.resolved`.
2. Added `assertSafeDestination` to reject any attempt (including via prompt input or symlink alias) to write a resolved snapshot to a runtime `.env.<stage>` input file.
3. Updated public documentation in `docs/guides/export-resolved-environment.md` and `docs/reference/cli.md` detailing the `.resolved` output filenames and explaining the separation between input dotenv and output snapshot.
4. Updated existing unit tests in `tests/exportEnv.test.ts` to reflect `.env.<stage>.resolved`.

Validation: All V213-004 tests in `tests/conformance/v213-audit.test.ts` (including table-driven multi-stage checks and prompt decline checks) and `tests/exportEnv.test.ts` passed.

