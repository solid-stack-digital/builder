# Feature V3.1.0 Implementation Plan: First-Class `buildArgs` Support

This directory contains the complete architectural specification, implementation plan, and test suite design for adding first-class Docker build arguments (`buildArgs`) to `@solid-stack/builder`.

- **Normative Specification**: [feature_spec_v3.1.0.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/specs_v3/feature_spec_v3.1.0.md)
- **Base Specifications**: [spec_v3.0.0.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/specs_v3/spec_v3.0.0.md) and [EXECUTION_MODEL.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/EXECUTION_MODEL.md)
- **Target Package**: `@solid-stack/builder`
- **Scope**: `services.main` only

---

## Plan Structure & Execution Sequence

Execute the implementation in strict sequence across the following modules:

1. [00_MASTER_PLAN.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/execution_docs/05-implement_v3.1/00_MASTER_PLAN.md)
   - Executive summary, architectural review, acceptance criteria mapping, and master execution order.

2. [01_SCHEMA_TYPES_AND_VALIDATION.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/execution_docs/05-implement_v3.1/01_SCHEMA_TYPES_AND_VALIDATION.md)
   - TypeScript interface enhancements (`BuildArgs`, `MainService.buildArgs`, `MainOverlay.buildArgs`, `EffectiveMain.buildArgs`).
   - Zod schema extensions in [buildSchema.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/buildSchema.ts) and [meshSchema.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/meshSchema.ts).
   - Strict schema enforcement: allow on `main`, reject anywhere else, enforce strings-only.
   - JSON Schema code generation in [generate-schemas.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/scripts/generate-schemas.ts) and checked-in schema updates.
   - Comprehensive test cases (`BAR01`–`BAR09`).

3. [02_STAGE_MERGE_AND_MESH_EXTENDS.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/execution_docs/05-implement_v3.1/02_STAGE_MERGE_AND_MESH_EXTENDS.md)
   - Stage overlay inheritance in [resolveBuildStage.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts) (`base -> dev/prod/test`, and E2E `base -> prod -> e2e`).
   - Provenance tracking via `buildArgsOrigins: Map<string, Map<string, Origin>>`.
   - Mesh extends resolution in [applyMeshExtends.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/applyMeshExtends.ts) (`extends.main.buildArgs`).
   - Mesh stage overlay inheritance (`mesh base -> mesh prod -> mesh e2e`).
   - Comprehensive test cases (`BAR10`–`BAR11`).

4. [03_PRECEDENCE_REFERENCES_AND_OVERRIDE_COMPOSE.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/execution_docs/05-implement_v3.1/03_PRECEDENCE_REFERENCES_AND_OVERRIDE_COMPOSE.md)
   - `override-compose` build argument extraction, normalization, and validation in [validateOverrideCompose.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateOverrideCompose.ts).
   - Precedence ladder implementation in [compileGraphComposition.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts):
     - Standalone: `base < stage < override-compose < Builder`
     - Mesh: `source base < source stage < source override-compose < mesh base < mesh stage < Builder`
   - Builder endpoint reference interpolation and early validation:
     - Merging before reference validation.
     - Shadowed references are neither validated nor resolved.
     - Surviving references are resolved against requisite closures.
   - Strict `.env.<stage>` isolation: `.env` files NEVER participate in `buildArgs`.
   - Builder-owned build args guard and reserved key validation.
   - Comprehensive test cases (`BAR12`–`BAR23`).

5. [04_DOCKER_BUILD_INTEGRATION_AND_ACCEPTANCE_TESTS.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/execution_docs/05-implement_v3.1/04_DOCKER_BUILD_INTEGRATION_AND_ACCEPTANCE_TESTS.md)
   - Docker Compose compilation: supplying `Record<string, string>` to `service.build.args`.
   - Docker runtime execution and real Docker acceptance testing (`BAR24`, `BAR25`).
   - Full Acceptance Criteria verification matrix (all 18 criteria from `feature_spec_v3.1.0.md §22`).
   - Documentation updates and migration guides.
