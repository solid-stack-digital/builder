# Step 4: Docker Build Integration, Real Docker Acceptance, and Release Checklist

This document details the final phase: Docker daemon ingestion, real Docker acceptance testing, public documentation updates, and full acceptance verification against the 18 criteria of [feature_spec_v3.1.0.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/specs_v3/feature_spec_v3.1.0.md).

---

## 1. Docker Build Ingestion

When Builder runs `builder dev`, `builder prod`, `builder test`, or `builder mesh`, it serializes the compiled composition to Compose YAML and invokes Docker Compose (`docker compose build` or `docker compose up --build`).

Compose natively ingests `services.<service>.build.args`:
```yaml
services:
  main:
    build:
      context: .
      dockerfile: Dockerfile
      target: dev
      args:
        BASE_PATH: /web
        NEXT_PUBLIC_API_URL: http://127.0.0.1:3000/api
```

During Docker build execution, Compose converts these key-value pairs into standard Docker CLI build arguments:
```bash
docker build --build-arg BASE_PATH=/web --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:3000/api ...
```

---

## 2. Real Docker Acceptance Test (`BAR25`)

Create a dedicated real Docker test in `tests/v3/docker/buildArgs.test.ts` (or integrated into `tests/v3/docker/standalone.test.ts`):

```typescript
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { runDev } from "../../../src/core/runners/runDev.js";
import { runProd } from "../../../src/core/runners/runProd.js";
import { runTestUnit } from "../../../src/core/runners/runTestUnit.js";

describe("Real Docker acceptance: buildArgs ingestion [BAR25]", () => {
  it("[BAR25] Docker daemon ingests buildArgs and verifies value during image build", async () => {
    const fixtureDir = path.resolve(".builder/test-tmp/docker-buildargs-fixture");
    fs.mkdirSync(fixtureDir, { recursive: true });

    // Create a Dockerfile that verifies the ARG during docker build
    fs.writeFileSync(
      path.join(fixtureDir, "Dockerfile"),
      `FROM alpine:3.20 AS base
ARG BUILD_FEATURE_FLAG
RUN test "$BUILD_FEATURE_FLAG" = "v3.1-verified"
CMD ["sh", "-c", "echo ready && sleep 3600"]

FROM base AS dev
CMD ["sh", "-c", "echo dev-ready && sleep 3600"]

FROM base AS prod
CMD ["sh", "-c", "echo prod-ready && sleep 3600"]
`
    );

    // Create build.json with first-class buildArgs
    fs.writeFileSync(
      path.join(fixtureDir, "build.json"),
      JSON.stringify({
        name: "docker-buildargs-app",
        services: {
          main: {
            buildArgs: {
              BUILD_FEATURE_FLAG: "v3.1-verified"
            },
            endpoints: {
              http: { port: 8080, primary: true }
            }
          },
          tester: {
            compose: "tester.yml",
            service: "tester"
          }
        }
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(fixtureDir, "tester.yml"),
      `services:
  tester:
    image: alpine:3.20
    command: ["echo", "test complete"]
`
    );

    // Run test-unit which builds and starts the container
    // If BUILD_FEATURE_FLAG is not passed, `test "$BUILD_FEATURE_FLAG" = "v3.1-verified"` fails and docker build exits with non-zero code!
    const exitCode = await runTestUnit({ projectDir: fixtureDir });
    expect(exitCode).toBe(0);
  });
});
```

---

## 3. Public Documentation & Security Notice

Update public documentation in `docs/`:

### 3.1 Security Warning (§17)
Add to [docs/reference/build-json.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/docs/reference/build-json.md):
> [!WARNING]
> **Do not use `buildArgs` for secrets!**
> Docker build arguments may be observable through build metadata, image history (`docker history`), cache records, or the build process. Secrets belong in BuildKit/Compose secret mechanisms or runtime environment variables, never in `buildArgs`.

### 3.2 Reference Documentation Update
Add the `buildArgs` schema entry to:
- `docs/reference/build-json.md`: `services.main.buildArgs` and `<stage>.services.main.buildArgs`.
- `docs/reference/mesh-json.md`: `services.<source>.extends.main.buildArgs` and `<stage>.services.<source>.extends.main.buildArgs`.

---

## 4. Final Acceptance Verification Checklist

Verify all 18 criteria of [feature_spec_v3.1.0.md §22](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/specs_v3/feature_spec_v3.1.0.md#L963):

- [ ] **1. `build.json` supports first-class main `buildArgs`**: Verified by `BAR01`.
- [ ] **2. All build stages (`dev`, `prod`, `test`, `e2e`) support them**: Verified by `BAR02`.
- [ ] **3. Mesh base and stages support them through `extends.main`**: Verified by `BAR03` & `BAR04`.
- [ ] **4. Normal services reject them**: Verified by `BAR05` (`services.db.buildArgs` throws).
- [ ] **5. Tester rejects them**: Verified by `BAR06` (`services.tester.buildArgs` throws).
- [ ] **6. Values are strings only**: Verified by `BAR08` (numbers/booleans/null/objects/arrays rejected).
- [ ] **7. `.env.<stage>` never contributes build args**: Verified by `BAR16` (keys in `.env.*` omitted from `service.build.args`).
- [ ] **8. E2E inherits prod structured build args**: Verified by `BAR11` (`base -> prod -> e2e`).
- [ ] **9. `override-compose` participates at documented precedence point**: Verified by `BAR12` (`base < stage < override < Builder`).
- [ ] **10. Mesh build args beat source override-compose args**: Verified by `BAR15` (mesh `extends.main.buildArgs` overrides `source.override-compose`).
- [ ] **11. References resolve after effective merging**: Verified by `BAR18` (`${api.endpoints.http.network_host}`).
- [ ] **12. References never create requisites**: Verified by `BAR19` (unreferenced requisite fails).
- [ ] **13. Shadowed invalid references do not fail**: Verified by `BAR21` (shadowed bad reference is skipped).
- [ ] **14. Surviving invalid references fail**: Verified by `BAR22` (surviving bad reference throws `ConfigError`).
- [ ] **15. Final resolved args reach Docker**: Verified by `BAR24` (`service.build.args` populated).
- [ ] **16. Builder-owned args remain authoritative**: Verified by `BAR23` (reserved key collisions rejected).
- [ ] **17. Runtime `env` behavior remains unchanged**: Verified by existing 388 Vitest tests.
- [ ] **18. Documentation and exhaustive examples updated**: Verified by docs updates.

---

## 5. Verification Gatekeeper Protocol

Run all gates in order:

```bash
# 1. Typecheck: Must pass with 0 errors
pnpm typecheck

# 2. Fast V3 Vitest Suite: All 388+ tests must pass
pnpm test:v3:fast

# 3. Real Docker Acceptance:
pnpm test:docker
```
