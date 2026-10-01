# TypeScript Package Template (`@solid-stack/ts-jspackage-template`)

A modern, production-ready starter template for building and publishing high-quality TypeScript / JavaScript libraries for the **Solid Stack** ecosystem using **pnpm**, **tsup**, **vitest**, and **@solid-stack/di**.

---

## ✨ Features

- ⚡ **Dual Output (ESM + CommonJS)**: Bundled via [tsup](https://tsup.egoist.dev/) with tree-shaking and sourcemaps.
- 🔒 **Type Declarations**: Independent, reliable declaration emit (`.d.ts` and `.d.ts.map`) via `tsc --project tsconfig.build.json`.
- 💉 **Dependency Injection Ready**: Native support for `@solid-stack/di` decorators (`@MakeInjectable`), `ValueToken`, `MultiToken`, and `Container`.
- 🧪 **Unit Testing**: Powered by [Vitest](https://vitest.dev/) with built-in Stage 3 decorator transform support.
- 📦 **pnpm First**: Optimized for deterministic dependency management.
- 🛡️ **Pre-publish Validation**: Automated pre-publish checks verifying build output completeness.
- 🐳 **Docker & Make Support**: Containerized dev, test, and build environments.
- 🤖 **GitHub Actions CI/CD**: Ready-to-use workflows for multi-version Node.js matrix testing and automated npm publishing.

---

## 📁 Project Structure

```text
.
├── .github/
│   └── workflows/
│       ├── ci.yml               # Automated CI matrix testing (Node 18, 20, 22)
│       └── publish.yml          # Automated npm publish workflow
├── docker/
│   ├── Dockerfile               # Multi-stage Docker build
│   └── docker-compose.yml       # Docker Compose setup
├── examples/
│   └── basic.ts                 # Executable usage example (DI + pure utils)
├── scripts/
│   ├── build.ts                 # Build runner (tsup + tsc)
│   └── prepublish-check.ts      # Pre-publish validation script
├── src/
│   ├── core/                    # Domain logic & @MakeInjectable services
│   │   ├── GreeterService.ts
│   │   └── index.ts
│   ├── types/                   # Type definitions & DI ValueTokens
│   │   ├── tokens.ts
│   │   └── index.ts
│   ├── utils/                   # Pure utility functions
│   │   ├── formatGreeting.ts
│   │   └── index.ts
│   └── index.ts                 # Strict public API gateway
├── tests/
│   ├── GreeterService.test.ts   # Container resolution & service unit test
│   ├── formatGreeting.test.ts   # Pure utility test
│   └── public-api.test.ts       # Public export barrier test
├── Makefile                     # Shortcut Makefile for Docker/dev workflows
├── package.json                 # Package manifest & configuration
├── tsconfig.json                # TypeScript compiler configuration
├── tsconfig.build.json          # Declaration-only build configuration
├── tsup.config.ts               # tsup bundler configuration
└── vitest.config.ts             # Vitest test runner configuration
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure for Your Package
Update the following in `package.json`:
- `name`: Your package name (e.g., `@solid-stack/my-package`)
- `description`: A brief summary of your library
- `repository`: Your GitHub repository URL
- `homepage`: Your project homepage / README link

### 3. Develop & Test
```bash
# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tsup build in watch mode
pnpm dev
```

### 4. Build & Validate
```bash
# Typecheck, test, and bundle package
pnpm check

# Run full pre-publish verification
pnpm prepublishOnly
```

---

## 🐳 Docker / Make Commands

```bash
make dev     # Start dev watcher container
make test    # Run test suite in container
make build   # Build package in container
make prod    # Verify production container
make clean   # Clean up containers and volumes
```

---

## 📄 License

UNLICENSED © [Solid Stack Digital](https://github.com/solid-stack-digital)
