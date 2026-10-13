---
"@solid-stack/builder": minor
---

Remove the legacy root test field from mesh.json. Builder now rejects its
presence, including an empty object and when --skip-checks is supplied.
Mesh configuration supports dev, prod, and e2e overlays only.

Remove mesh up/down test-unit. Use service up/down test-unit for isolated
service execution/recovery. mesh up test retains the sequential standalone
service test lifecycles followed by a clean global E2E mesh.

Move service-owned isolated settings to build.json.test and global E2E
topology settings to mesh.json.e2e as appropriate. build.json.test and
service test execution remain supported. See docs/migration/v2.1-to-v2.2.md.
