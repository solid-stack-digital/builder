# Publish reachable mesh endpoints

A source `publish` selector has the form `main.endpoints.http` or `db.endpoints.ui`. The selected node must already be reachable by requisites and the endpoint must declare `publicPort`. Mesh source endpoints are otherwise private even with `publicPort`. A stage `publish` array replaces the earlier list; repeat all bindings you need. A private endpoint still exposes network properties but not public properties. See [publication](../concepts/publication-and-ports.md).
