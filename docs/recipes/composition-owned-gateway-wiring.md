# Wire gateway URLs in the mesh

Use `services.gateway.extends.main.requisites` to add explicit edges to backend/frontend and `extends.main.env` to set their cross-source network URLs. Each consumer's closure must contain each referenced target. A requirement-only cycle can be legal, but the dependency/prerequisite ordering subgraph must remain acyclic. Do not expect references or publication to add edges. See the [mesh reference](../reference/mesh-json.md).
