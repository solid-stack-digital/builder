# Fix configuration errors

| Symptom | Cause and correction |
|---|---|
| Unknown or legacy field | V2 schemas are strict and do not translate old fields. Remove it or use the replacement in the [migration guide](../migration/v1-to-v2.md). |
| Missing `app` | Every service `build.json` requires an `app` object, even if it is empty. See [build.json](../reference/build-json.md). |
| Invalid identifier | Keys must match `^[a-z][a-z0-9-]*$`; mesh names also cannot be reserved. See [identifier rules](../reference/identifier-rules.md). |
| Environment value rejected | Builder JSON env values must be strings; quote textual numbers/booleans. See [environment](../concepts/environment.md). |
| Port out of range | `port`/fixed `publicPort` must be integers 1–65535; `publicPort` may also be `AUTO`. See [endpoints](../concepts/endpoints.md). |
| Missing/multiple primary | A non-empty effective endpoint map needs exactly one `primary: true`. See [endpoints](../concepts/endpoints.md). |
| Stage-added dependency incomplete | Effective dependency still needs `compose`; each endpoint still needs `service` and `port`. No deletion syntax exists. See [stages](../concepts/stages.md). |
| Stage-added mesh service has no path | Every effective service needs a path. See [mesh.json](../reference/mesh-json.md). |

Run `builder check` or `builder mesh check` to locate the effective config path and stage.

## Related

- [Validate before running](../guides/validate-before-running.md)
- [build.json](../reference/build-json.md)
- [Stage overlays](../concepts/stages.md)
