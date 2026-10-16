# Use automatic host ports

Set an endpoint's `publicPort` to `"AUTO"`. In standalone it is published when reachable; in a mesh select it with `publish`. Builder allocates an available host port and resolves `${main.endpoints.http.public_url}` or the mesh equivalent to the effective value. Do not guess localhost ports from internal `port`. Publication does not add a requisite, and a private mesh endpoint has no public URL. See [endpoint properties](../reference/endpoint-properties.md).
