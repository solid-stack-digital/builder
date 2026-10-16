# Give one service multiple endpoints

Declare several endpoints with their actual internal `port` and, for an ordinary module, owning `service`. Exactly one is primary. Main `PORT` follows its primary internal port; an ordinary module's representative follows its primary owner. A secondary owner does not become a separate logical lifecycle target and does not automatically need a healthcheck unless its own native Compose dependency requires one. Publish each desired reachable endpoint separately in a mesh. See [endpoints](../concepts/endpoints.md).
