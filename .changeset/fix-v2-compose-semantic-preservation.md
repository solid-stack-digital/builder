---
"@solid-stack/builder": patch
---

Fix V2 Compose semantic preservation across app overrides, dependency namespacing and ownership, healthcheck validation, global tester composition, and generated mesh JSON Schema constraints.

Preserve raw Compose interpolation and environment pass-through. Reject unsupported override fields, dependency profiles/extends, and service-reference build additional contexts before composition. Preserve remote build contexts, build secrets, and tester helper dependency edges.

Private generated names now use a shared collision-aware allocator. Ordinary dependency names remain readable; colliding names receive identity-derived suffixes, and mesh override resources include their consuming service. User configuration must continue using logical endpoint references.
