# Changelog

## 1.1.1

### Patch Changes

- Refactor individual service tester environment overrides and URL templating in `compileEnvironment` to run directly before compose name attachment, ensuring consistent interpolation of `${<dependency>.network_url}`, `${app.network_url}`, and `${app.public_url}` for declared dependencies in individual service E2E testing.

## 1.1.0

### Minor Changes

- 6a9f1a8: ### Features & Enhancements
  
  #### 1. CLI Version Declaration
  - The CLI now displays its current version (`builder v<version>`) dimmed on every run.
  - When running help or version queries (`-h`, `--help`, `-V`, `--version`), the banner is suppressed to preserve clean output.
  - When executed with no arguments, the version banner is printed alongside the command help usage.
  
  #### 2. Standardized Internal Networking & Host Port Precedence
  - **Standardized Internal Port (3000)**: All services in a mesh now listen internally on port `3000` (`environment.PORT = "3000"`). Builder internal DNS and TCP healthchecks strictly target container port `3000`.
  - **Public Port Cascade**:
    1. `mesh.services[name].port`: Explicitly exposes the specified host port, mapping `<port>:3000`. Overrides all other declarations.
    2. `mesh.services[name].preservePort === true`: Uses the `port` field defined in the service's `build.json`, mapping `<buildJson.port>:3000`.
    3. If both `port` and `preservePort` are absent, the service is accessible only to other members of the internal network and does not bind any host ports.
  
  #### 3. URL Templating Engine & Mesh Tester Environment Overrides
  - Added Pass 1 URL registry in the mesh compiler to resolve internal `networkUrl` (`http://<service>:3000`) and host `publicUrl` (`http://localhost:<publicPort>`).
  - Supported dynamic template variable interpolation:
    - `${<service>.network_url}`
    - `${<service>.public_url}`
    - Path suffixes like `${<service>.public_url}/api`
  - Templates are resolved across `serviceConfig.envOverrides` and global `mesh.tester.envOverrides`.
  - Strict compile-time validation: Throws a clear `ScriptError` if a template references an undeclared service or attempts to resolve `${service.public_url}` on a service that does not expose a public port.
  
  #### 4. Individual Service E2E Tester Overrides & Templating
  - Added `tester.envOverrides` support to `build.json` and `BuildJson` type.
  - During individual service `e2e` stage compilation (`compileEnvironment`), resolves internal URLs for `app` (`http://app:3000`), the app's public URL (if `build.json` defines `port`), and all declared `dependencies` (`http://<dep>:3000`).
  - Interpolates templates in `buildJson.tester.envOverrides` and injects them into the `tester` container.
  - Throws descriptive errors if an unresolved template variable is detected.
  
  #### 5. Standalone Compilation Port Support
  - `compileEnvironment` standalone compilation now checks for `buildJson.port` and injects `PUBLIC_PORT` and `PORT: "3000"` into Docker Compose evaluation.
  
  #### 6. JSON Schema Generation & IDE Autocomplete
  - Added `buildJsonSchema` Zod definition in `src/core/buildSchema.ts` with comprehensive field documentation.
  - Added optional `$schema` property to `buildJsonSchema`, `meshSchema`, `BuildJson`, and `MeshConfig` so developers can add `$schema` references in `build.json` and `mesh.json` for IDE autocomplete without triggering strict validation errors.
  - Added `scripts/generate-schemas.ts` using `zod-to-json-schema` to output `schemas/mesh-schema.json` and `schemas/build-schema.json`.
  - Added `"build:schemas"` script in `package.json` and added `"schemas"` to npm package distribution files.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Initial Release
- Initial release of the package.
