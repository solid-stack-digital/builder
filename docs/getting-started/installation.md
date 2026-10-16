# Install and verify Builder V3

The source tree declares `@solid-stack/builder` 3.0.0 and requires Node.js 20 or newer. Docker Engine and Docker Compose are needed to run containers. This checkout does not establish that 3.0.0 is already available in a registry. For a local checkout, run `pnpm install`, `pnpm build`, then `node dist/bin.js --version`. When a V3 package is available from your configured registry, install it with your package manager and verify `builder --version`. The package exposes both `builder` and `solid-builder`.

Existing 2.2.0 users should follow the [migration guide](../migration/v2.2-to-v3.0.md) before running V3 against old configuration. Use `builder --help` to inspect commands and `builder check -C <service>` to check a source.
