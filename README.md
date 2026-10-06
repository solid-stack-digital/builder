# @solid-stack/builder

The official build system, test runner, and Docker orchestrator CLI for Solid Stack services.

## Installation

### Global Installation (CLI tool)

Install globally using `pnpm` (or `npm`):

```bash
pnpm add -g @solid-stack/builder
```

Once installed globally, the CLI tool is available directly as `builder`:

```bash
builder --version
builder --help
```

### Local / Project Installation

When developing within a project or monorepo, add `@solid-stack/builder` to your dependencies (or link to local source during development via `"@solid-stack/builder": "link:../../builder"`), and run commands via `pnpm`:

```bash
# Add script in package.json: "builder": "builder"
pnpm builder service up dev
# or via pnpm exec
pnpm exec builder service up dev
```

---

## 🚀 CLI Commands

### 1. Development Mode (`builder service up dev`)

Spins up the isolated development environment with hot-reloading:

```bash
builder service up dev
```

- Performs Dockerfile linting (`hadolint`) and OPA policy contract validation (`conftest`)
- Merges `docker-compose.base.yml`, `docker-compose.dev.yml`, `.env.dev`, and any overrides defined in `build.json`
- Mounts source code with hot-reloading enabled

#### Full Development Mode (`builder service up dev --full`)

Spins up the development environment with hot-reloading while connecting to all declared mock dependencies and setting `INFRA_MODE=integrated`:

```bash
builder service up dev --full
# Or alias:
builder service up dev --integrated
```

### 2. Production Mode (`builder service up prod`)

Spins up the production runtime with integrated local mocks:

```bash
builder service up prod
```

- Validates infrastructure and contract compliance
- Merges production compose definitions with mock dependencies (e.g., wiremock, databases)
- Sets up inter-service health checks (`service_healthy` conditions)

### 3. Test Suites (`builder service up test`)

Runs the full end-to-end test pipeline:

```bash
builder service up test
```

- Stage 1: Runs isolated unit tests (`pnpm test` in test container)
- Stage 2: If unit tests pass, boots dependencies, app, and tester containers for integration/E2E assertions (`pnpm test:e2e`)
- Automatically cleans up and tears down containers upon completion

#### Targeting specific test stages

```bash
# Run only unit tests
builder service up test --unit
# Or shorthand:
builder service up test-unit

# Run only E2E integration tests
builder service up test --e2e
# Or shorthand:
builder service up test-e2e
```

---

### Export the application environment (`builder service export env [stage]`)

```bash
# Export all four stages into the service directory
builder service export env

# Export one stage only
builder service export env dev
builder service export env prod
builder service export env test
builder service export env e2e -C ./services/backend

# Match full/integrated development mode
builder service export env dev --full
```

The default output names are `env.dev`, `env.prod`, `env.test`, and `env.e2e` (without a leading dot). These snapshots do not replace the `.env.<stage>` input files automatically. If an output file exists, Builder asks whether to overwrite it. Declining prompts for a new filename relative to the service directory; an existing replacement filename also requires confirmation. Existing files require an interactive terminal.

Exports use the same stage compilation as service startup, including Compose environment files, overrides, Builder URL templates, and `build.json.envOverrides`. All requested stages are compiled before any files are written. Only the application service's resolved runtime environment is exported, not build arguments, dependencies, or tester settings. E2E runs the application using the production configuration, so `env.e2e` reflects that app environment plus any E2E app overrides; it does not merge the tester's `.env.e2e` into the app.

The command requires Docker Compose 2.24 or newer, but does not require a running Docker daemon or start/build containers. Image-only `ENV` defaults and values added by application startup code cannot be determined by configuration simulation and are outside the export. New files use owner-only permissions and contain the actual values. Values follow [Compose dotenv quoting rules](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) to preserve literal dollars and multiline strings.

## 🛠️ Options

| Flag | Description |
|---|---|
| `--dry-run` | Preview the merged Docker Compose YAML configuration without starting containers |
| `--debug` | Print the final merged Docker Compose YAML before launching |
| `--skip-check` | Skip hadolint and conftest infrastructure validation |
| `-d, --detach` | Run Docker Compose in detached mode (background) |
| `-C, --project-dir <path>` | Specify target service directory (defaults to current working directory) |
| `--unit` | For `test`, run only unit test stage |
| `--e2e` | For `test`, run only e2e test stage |
| `--full` | For `dev`, spin up with mock dependencies and `INFRA_MODE=integrated` |
| `--integrated` | Alias for `--full` |

---

## ⚙️ Configuration (`build.json`)

Each service configures its dependencies and overrides via `build.json` in its project root:

```json
{
  "name": "backend",
  "dependencies": {
    "filesystem": {
      "path": ".docker/mocks/docker-compose.filesystem.yml",
      "service": "mock-filesystem"
    }
  },
  "overrides": {
    "dev": {
      "path": ".docker/overrides/docker-compose.dev.override.yml"
    },
    "test": {
      "path": ".docker/overrides/docker-compose.test.override.yml"
    },
    "prod": {
      "path": ".docker/overrides/docker-compose.prod.override.yml"
    },
    "e2e": {
      "path": ".docker/overrides/docker-compose.e2e.override.yml"
    }
  }
}
```

---

## 💻 Programmatic Usage

You can also import `@solid-stack/builder` inside Node.js or TypeScript code:

```typescript
import {
  compileEnvironment,
  getBuildJson,
  checkInfra,
  handleServiceUp,
} from "@solid-stack/builder";

// Compile Docker Compose YAML for a specific environment
const devYaml = compileEnvironment("dev", "/path/to/service");

// Boot an environment programmatically
await handleServiceUp("dev", {
  projectDir: "/path/to/service",
  skipCheck: false,
});
```

---

## 📄 License

UNLICENSED © Solid Stack Digital
