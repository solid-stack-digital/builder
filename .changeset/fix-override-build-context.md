---
"@solid-stack/builder": patch
---

Fix V2 nested app override Compose handling so build-args-only overrides preserve Builder-owned application build contexts in standalone and mesh compilation.

App override relative paths now resolve from the service project rather than the override file directory, explicit equivalent build contexts are compared by canonical filesystem identity, and actual build-context replacement remains rejected.
