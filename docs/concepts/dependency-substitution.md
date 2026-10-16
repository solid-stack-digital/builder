# Replace a local service through source overrides

V2 provider substitution is gone. A V3 mesh replaces a local mock with three explicit changes in `extends`: set its `source.<local>` requisite to `false`, add a requisite to the fellow source alias, and rewrite the effective env reference to that source's endpoint. If a nested ordinary consumer also refers to the mock, rewrite its requisite and env separately. No endpoint-name matching or readiness transfer occurs automatically. See the [worked migration](../migration/v2.2-to-v3.0.md#mesh-two-source-roots-and-explicit-replacement).
