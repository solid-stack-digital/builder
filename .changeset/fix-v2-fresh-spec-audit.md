---
"@solid-stack/builder": patch
---

Fix additional Builder V2 conformance gaps discovered by a fresh specification audit.

- preserve normative per-service mesh AUTO port allocation order;
- validate effective mesh test-stage dependency bindings and publication;
- enforce relative syntax for Builder-managed project paths;
- allow finite test targets to disable inherited Docker healthchecks while keeping dev/prod readiness mandatory;
- fail fast on dangling Compose named-resource references;
- preserve local build additional-context paths when Compose files are inlined;
- complete global tester service-reference closure;
- use one correct Compose published-port parser for runtime/static checks;
- preserve dependency-internal service DNS identities on dependency-owned networks.
