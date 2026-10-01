# Example Backend Service

A lightweight example service that uses `@solid-stack/builder` linked directly to the local builder source code.

## Quick Start

From this directory, run `pnpm install` if not already installed.

### Run Development Environment

Spins up the dev container with hot-reloading:

```bash
pnpm builder service up dev
```

### Run Production Environment

Spins up the production runtime with mock dependencies:

```bash
pnpm builder service up prod
```

### Run Test Suite

Runs unit tests and E2E integration tests:

```bash
pnpm builder service up test
```

### Infrastructure & Policy Check

```bash
pnpm builder check
```

### Previewing Configurations (Dry Run)

```bash
pnpm builder service up dev --dry-run
pnpm builder service up prod --dry-run
pnpm builder service up test --dry-run
```
