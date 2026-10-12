# Execution Model Specification

## 1. Runtime Variables

### `EXEC_MODE`

Defines how application code executes.

Allowed application values:

- `dev` — development runtime.
- `test` — unit/isolated test runtime.
- `prod` — production-equivalent runtime.

`e2e` is **not** an application execution mode. It is used only by E2E tester processes.

### `INFRA_MODE`

Defines how application dependencies are provided.

- `isolated` — no external dependency containers; application uses in-process stubs/mocks.
- `integrated` — dependencies are consumed through their normal external/network interfaces.

When integrated, the application must not know whether a dependency is production infrastructure, an emulator, a mock service, or another mesh service.

E2E testers do **not** receive `INFRA_MODE`.

---

## 2. Standalone Service Execution

| Command / phase | Docker target | `EXEC_MODE` | `INFRA_MODE` | Env file |
|---|---|---|---|---|
| `make dev` | `dev` | `dev` | `isolated` | `.env.dev` |
| `make dev --full` | `dev` | `dev` | `integrated` | `.env.dev` |
| `make prod` | `prod` | `prod` | `integrated` | `.env.prod` |
| Unit / isolated test | `test` | `test` | `isolated` | `.env.test` |
| Service E2E app | `prod` | `prod` | `integrated` | `.env.e2e` |
| Service E2E tester | `test-e2e` | `e2e` | — | `.env.e2e-tester` |

### `make test`

Runs sequentially:

1. Unit / isolated tests.
2. Service E2E.

If Phase 1 fails, Phase 2 does not run.

Service E2E runs the application exactly as production execution:

```text
target=prod
EXEC_MODE=prod
INFRA_MODE=integrated
```

The tester is the only test-aware process.

---

## 3. Mesh Execution

| Mesh mode | App target | `EXEC_MODE` | `INFRA_MODE` | App env |
|---|---|---|---|---|
| `mesh dev` | `dev` | `dev` | `integrated` | each service `.env.dev` |
| `mesh prod` | `prod` | `prod` | `integrated` | each service `.env.prod` |
| Global E2E apps | `prod` | `prod` | `integrated` | each service `.env.e2e` |
| Global E2E tester | `test-e2e` | `e2e` | — | root `.env.e2e-tester` |

Mesh dependency providers replace the corresponding local dependency implementations. Unprovided dependencies use the service's own integrated dependency implementation.

---

## 4. E2E Configuration Inheritance

Structured configuration inheritance:

```text
base
  -> prod
    -> e2e
```

This applies to both:

- service-level E2E (`build.json`);
- global E2E (`mesh.json`).

E2E may override production-shaped composition to support testing, including:

- extra dependencies/services;
- Mailpit or similar inspection infrastructure;
- different credentials or endpoints;
- test fixtures;
- dependency-provider overrides;
- additional publication of already-publishable endpoints.

However, application code still runs as production code:

```text
EXEC_MODE=prod
INFRA_MODE=integrated
```

Production-shaped does **not** mean production values.

---

## 5. Tester Environment

Tester environment precedence, low to high:

```text
.env.e2e-tester
-> tester.env
-> Builder internal tester environment
```

Application `.env.e2e` and tester `.env.e2e-tester` are separate and are never implicitly merged.

---

## 6. Global `make test`

Global testing has exactly two phases.

### Phase 1 — Independent Service Tests

For every service declared in root `mesh.json.services`, sequentially run the semantic equivalent of that service's own `make test`:

```text
unit / isolated
-> service E2E
```

Services are not tested concurrently.

After each service, its containers, dependencies, tester, networks, ports, and runtime state are fully torn down.

### Phase 2 — Global E2E

Start a clean production-shaped mesh:

```text
base
-> prod
-> e2e
```

Every application runs:

```text
target=prod
EXEC_MODE=prod
INFRA_MODE=integrated
.env.e2e
```

Then run the global E2E tester:

```text
target=test-e2e
EXEC_MODE=e2e
.env.e2e-tester
```

No Phase 1 runtime state may leak into Phase 2.

---

## 7. Responsibility Boundary

Builder sets execution and infrastructure semantics.

The application decides how to interpret them:

```text
INFRA_MODE=isolated
-> application selects in-process stubs/mocks

INFRA_MODE=integrated
-> application selects real integrated adapters
```

Builder remains technology-agnostic and does not inspect application DI/runtime implementation.