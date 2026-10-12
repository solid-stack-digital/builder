# 05 — Make the quickstart's AUTO host URL export instruction reproducible

## Documentation bug report

**Bug.** The service quickstart configures an app endpoint with `publicPort: "AUTO"`, then tells the reader to “Read the resolved host URL from a Builder reference/export.” Its sample `build.json` has no `app.env` key containing that reference. `builder service export env dev` exports the app's environment values; it does not automatically add a public URL variable. Following the sample gives an export with no host URL to read. The AUTO-port recipe repeats the export suggestion without its required configuration step.

**Why it is a bug.** V2 §8 defines `public_url` as an endpoint property and §10 defines explicit Builder reference syntax. V2 §11.2 describes app env as a user-configured map with precedence; it does not promise automatic injection of all endpoint properties. The only Builder-owned endpoint-derived app key is the primary endpoint's `PORT`, which is the **container** port, not the AUTO host port. The current [compileApplicationEnv.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/compileApplicationEnv.ts) returns the compiled app environment, so the public quickstart suggests an observable feature its own sample does not activate.

**Observed evidence.** The `V213-D05` test parses the quickstart's exact JSON sample, compiles its dev app environment through Docker Compose, and finds no value matching `http://127.0.0.1:<allocated port>`. A control adds `app.env.PUBLIC_URL: "${app.endpoints.http.public_url}"`; then the exported map contains that resolved URL. This is a documentation correction. Do not auto-inject new environment keys into every app.

**Expected documentation.** The quickstart explicitly adds a host URL reference to `app.env` before directing users to export it, or removes the export promise. The AUTO-port recipe states the same prerequisite. Readers can distinguish `PORT=3000` inside the app from the allocated host port. If the sample includes `PUBLIC_URL`, clarify that it is a host-facing value and should not be used by the app as an inter-container address.

Apply [plan 04](04-keep-resolved-env-export-separate-from-runtime-dotenv.md) first. The current default export writes `.env.dev` and then causes the next service compilation to reject Builder-owned keys. This documentation plan must describe the corrected `.env.dev.resolved` output.

## Red test gate

Install the shared [V213 reproduction](reproductions/v213-audit.test.ts.txt) as `tests/conformance/v213-audit.test.ts` per the [index](00-audit-index.md), then run:

```bash
pnpm exec vitest run tests/conformance/v213-audit.test.ts -t V213-D05
```

The red assertion reads the public quickstart's first JSON block and passes it to the real export compiler:

```ts
const doc = readFileSync("docs/getting-started/service-quickstart.md", "utf8");
const block = doc.match(/```json\n([\s\S]*?)\n```/)?.[1];
const root = fixture(JSON.parse(block!));
const exported = compileApplicationEnv("dev", root);
expect(Object.values(exported).some(value =>
  /^http:\/\/127\.0\.0\.1:\d+$/.test(value))).toBe(true);
```

**Observed red:** this assertion gets `false`; the control adding an explicit public URL reference passes. The test needs the local Docker Compose CLI for `compose config` but starts no container. If the first assertion passes on the implementer's branch before editing, skip the plan and record that output. If Docker is absent or fixture setup fails, repair the environment/harness and rerun; such a failure does not establish or disprove the documentation bug.

## Exact documentation changes

In `docs/getting-started/service-quickstart.md`, add an `env` entry to its `app` JSON object. Preserve the existing endpoint:

```json
{
  "app": {
    "env": {
      "PUBLIC_URL": "${app.endpoints.http.public_url}"
    },
    "endpoints": {
      "http": {
        "port": 3000,
        "publicPort": "AUTO",
        "primary": true,
        "scheme": "http"
      }
    }
  }
}
```

Replace the ambiguous instruction after the first `builder service up dev` example with a concrete command and interpretation:

```text
`PUBLIC_URL` resolves to the host-facing URL because `app.env` explicitly references
`app.endpoints.http.public_url`. Run `builder service export env dev` to write the
resolved app environment, then read `PUBLIC_URL` from `.env.dev.resolved`. `PORT` is
the app's container port and is not the allocated host port. The export file may
contain secrets; keep it out of version control.
```

After plan 04, `builder service export env dev` writes `.env.dev.resolved`; if that output already exists, the command prompts to overwrite or choose another filename. The separate `.env.dev` remains the runtime dotenv input. A fully deterministic copyable instruction can use a fresh sample project and mention this prompt. Do not claim the command prints the URL directly to stdout.

In `docs/recipes/automatic-host-ports.md`, change the opening explanation to include the same prerequisite:

```text
To include the allocated URL in `builder service export env`, first put a
`public_url` reference in `build.json.app.env`, for example
`"PUBLIC_URL": "${app.endpoints.http.public_url}"`. Export copies resolved app
environment values; it does not emit a separate endpoint registry.
```

## Green verification

1. Rerun the exact `-t V213-D05` gate; both sample and control must pass.
2. Check the first quickstart JSON block with `JSON.parse`, compile the example with `compileApplicationEnv("dev", ...)`, and assert `PUBLIC_URL` matches the resolved `http://127.0.0.1:<number>` format. Its numeric port may vary; never hardcode it in the test or docs.
3. Run `pnpm exec vitest run tests/conformance/v213-audit.test.ts tests/exportEnv.test.ts` and `pnpm typecheck`.
4. Inspect the final prose so it accurately states the file-writing behavior and existing-file prompt. Leave the runtime export implementation and schema untouched.
