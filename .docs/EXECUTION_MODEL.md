# Service and Orchestrator Execution Specification

## 1. Runtime Modes

### `EXEC_MODE` — Execution State

Defines the runtime state of the application code inside the application container.

It determines how the application is built, compiled, and executed.

Supported states:

- `dev` — development execution, including hot reload where supported.
- `test` — unit/isolated test execution.
- `prod` — production-equivalent execution.

---

### `INFRA_MODE` — Infrastructure Scope

Defines the infrastructure boundary surrounding the application.

Supported states:

- `isolated` — no external dependency containers are started. Dependencies are replaced by in-process stubs/mocks implemented inside the service code.
- `integrated` — dependencies are provided through their normal network/service interfaces.

When `INFRA_MODE=integrated`, the application must not know whether a dependency is:

- a real production system;
- a local emulator;
- a mock container;
- or another service in the orchestrated system.

The application only consumes the configuration provided to it.

---

# 2. Service Principles

Every service MUST:

- be independently owned and maintained;
- have its own repository;
- be independently runnable and testable;
- expose its own build configuration;
- support:

```bash
make dev
make prod
make test
```

without requiring the global orchestrator.

Each service MUST provide two forms of dependency replacement:

1. **In-process stub/mock**
   - Used with `INFRA_MODE=isolated`.
   - The application is explicitly running without external infrastructure.

2. **Service-compatible mock implementation**
   - Used with `INFRA_MODE=integrated`.
   - Behaves through the dependency's normal external interface.
   - The application must be unaware that the implementation is a mock.

The build system MUST remain technology-agnostic.

The build system defines lifecycle and infrastructure semantics only. The service's Dockerfile is responsible for translating those semantics into the service's actual technology stack.

---

# 3. Dependency Types

## Third-Party Dependencies

Examples:

- Firebase
- Supabase
- PostgreSQL
- object storage
- external filesystem service

Third-party dependencies belong to the individual service.

Properties:

- They are managed by that service.
- The orchestrator does not need to know about them.
- Two services using the same third-party technology still receive independent dependency instances.
- A service is responsible for providing its own local/mock implementation when running integrated locally.

Example:

```text
service-a -> firebase-a
service-b -> firebase-b
```

These are separate instances.

---

## Fellow-Service Dependencies

A fellow-service dependency exists when one application service depends on another application service.

Example:

```text
frontend -> backend
orders   -> users
```

At the individual service level, the dependency may be represented by a local mock implementation.

At the orchestrator level, that mock is replaced by the actual fellow service.

The orchestrator MUST therefore know about fellow-service dependencies.

---

# 4. Individual Service Lifecycle

## `make dev`

Required runtime:

```text
EXEC_MODE=dev
INFRA_MODE=isolated
```

Behavior:

- Run only the application container.
- Enable development behavior such as hot reload.
- Do not start external dependency containers.
- Use in-process stubs/mocks for dependencies.
- The service must run independently of the orchestrator.

---

## `make prod`

Required runtime:

```text
EXEC_MODE=prod
INFRA_MODE=integrated
```

Behavior:

- Run the application using its production-equivalent runtime.
- Start all required local dependency implementations.
- Third-party dependencies may therefore be local mock/emulator containers.
- Fellow-service dependencies may also use their service-level mock implementations.

The application must not know that these dependencies are mocks.

It receives endpoints, credentials, and other configuration normally and behaves as production code would.

Example:

```text
application
├── mock Firebase
└── mock filesystem service
```

---

## `make test`

The service test pipeline has two mandatory phases.

### Phase 1 — Unit / Isolated Test

```text
EXEC_MODE=test
INFRA_MODE=isolated
```

Behavior:

- Run unit and isolated tests.
- Do not start dependency containers.
- Use in-process dependency stubs/mocks.
- Stop immediately if this phase fails.

### Phase 2 — Service E2E

After Phase 1 passes, start the test subject using:

```text
EXEC_MODE=prod
INFRA_MODE=integrated
```

Behavior:

- Start the production-equivalent application.
- Start its required local dependency implementations.
- The application must behave exactly as it does under `make prod`.
- The application must not know that its dependencies are mocks.

Then start the service E2E tester.

The E2E tester:

- is explicitly aware of the test subject;
- communicates with the running application through its external interface;
- determines the final success or failure of the service E2E phase.

Therefore:

```text
make test

1. Unit / isolated tests
2. Production-equivalent service
   + integrated dependencies
   + service E2E tester
```

---

# 5. Orchestrator Principles

The orchestrator MUST:

- be a meta-project;
- contain services as Git submodules;
- orchestrate independently owned services;
- reuse the build definitions supplied by each service;
- avoid reimplementing service lifecycle behavior;
- override only the relationships necessary to connect fellow services.

The orchestrator does not own a service's third-party infrastructure.

Each service continues to provide and manage its own third-party dependencies.

---

# 6. Global `make dev`

For every service:

```text
EXEC_MODE=dev
INFRA_MODE=integrated
```

Behavior:

- Start all application services.
- Enable their development/hot-reload behavior.
- Start each service's own third-party dependencies.
- Connect fellow-service dependencies to the actual corresponding services.

When a fellow service is available in the orchestrator:

```text
service-local mock
        ↓ replaced by
actual mesh service
```

The local implementation of that fellow-service dependency MUST NOT also be started.

Conceptually, global development is:

```text
production-style infrastructure
+
development application execution
```

---

# 7. Global `make prod`

For every service:

```text
EXEC_MODE=prod
INFRA_MODE=integrated
```

Behavior:

- Build and run every service using production-equivalent execution.
- Connect fellow-service dependencies to the corresponding actual services.
- Start each service's remaining third-party dependencies.
- Suppress local fellow-service mocks when the real mesh service replaces them.

This represents the complete locally integrated system.

---

# 8. Global `make test`

The global test pipeline has two mandatory phases.

## Phase 1 — Independent Service Tests

For every service, execute the equivalent of that service's own:

```bash
make test
```

This means every service independently runs:

```text
1. Unit / isolated tests
2. Service E2E tests
```

The orchestrator MUST reuse the service's own test behavior rather than defining a different test pipeline.

Any service failure stops the global pipeline.

For three services:

```text
3 × unit/isolated test suites
3 × service E2E test suites
```

---

## Phase 2 — Global E2E

After every service passes its independent tests, start the complete system using the same service composition rules as global `make prod`.

For every service:

```text
EXEC_MODE=prod
INFRA_MODE=integrated
```

Behavior:

- Start every service in production-equivalent mode.
- Connect fellow-service dependencies to actual fellow services.
- Start each service's remaining third-party dependency implementations.
- Suppress replaced fellow-service mocks.

Then start the global E2E tester.

The global E2E tester:

- is aware of the complete running system;
- tests behavior across service boundaries;
- determines the final success or failure of the global test pipeline.

For three services:

```text
Service A unit
Service A E2E

Service B unit
Service B E2E

Service C unit
Service C E2E

Global E2E
```

---

# 9. Service Independence Requirement

A service MUST remain fully usable outside the orchestrator.

The following MUST work from the service repository itself:

```bash
make dev
make prod
make test
```

The orchestrator may compose and override fellow-service connections, but it MUST NOT make a service dependent on the existence of the root project.

Service repositories remain independently owned, developed, tested, and releasable.
