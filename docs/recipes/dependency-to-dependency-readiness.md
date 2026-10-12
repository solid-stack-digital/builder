# Make one local dependency wait for another

For a realtime service that needs Redis, put the readiness relationship in the dependency contract:

```json
{
  "dependencies": {
    "redis": { "compose": "dependencies/redis.yml", "endpoints": { "redis": { "service": "redis", "port": 6379, "primary": true } } },
    "realtime": { "compose": "dependencies/realtime.yml", "endpoints": { "ws": { "service": "realtime", "port": 8080, "primary": true } }, "dependsOn": ["dependencies.redis"] }
  }
}
```

The realtime endpoint env/address reference and the `dependsOn` readiness declaration solve separate problems: an address does not make Redis healthy or create ordering. See [lifecycle and readiness](../concepts/lifecycle-and-readiness.md).

## Related

- [Local dependencies](../concepts/local-dependencies.md)
- [Dependency Compose contract](../reference/dependency-compose-contract.md)
- [Lifecycle and readiness](../concepts/lifecycle-and-readiness.md)
