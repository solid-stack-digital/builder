# Endpoint reference scope

Source JSON uses `${main.endpoints.http.network_url}` or `${db.endpoints.tcp.network_host}`. Mesh-authored local values use `${source.main.endpoints.http.network_url}`; cross-source values use `${backend.source.main.endpoints.http.network_url}`. A consumer may refer only to itself or nodes in its requisite closure. Another active mesh root alone is insufficient. References never add graph edges. Only surviving effective env values are parsed; an unshadowed reference to a pruned target fails. See the [property table](../reference/endpoint-properties.md).
