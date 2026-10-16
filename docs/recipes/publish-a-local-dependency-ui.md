# Publish a local module UI

A mesh source can select `"inspection.endpoints.ui"` in its `publish` array. The local ordinary `inspection` node must already be reachable through requisites and its `ui` endpoint must have `publicPort`. Publishing does not bring a dormant module into the graph. A stage override must restate any other selectors it wants to retain. See [publication](../concepts/publication-and-ports.md).
