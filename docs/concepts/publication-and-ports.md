# Host publication

A reachable standalone endpoint with `publicPort` is published. Mesh endpoints are private by default; source `publish` selects reachable endpoints with that capability. `AUTO` asks Builder for an available host port, while a numeric value requests a fixed port. Fixed conflicts fail. A `publish` array replaces its predecessor in a stage, so repeat entries you still need. Publication never adds graph edges; a private endpoint still has network properties. See the [endpoint table](../reference/endpoint-properties.md).
