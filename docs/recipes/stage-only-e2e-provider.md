# Use a fake provider only in E2E

Add `fake-payments` under `e2e.services` with a valid service-project `path`, then overlay the consumer binding in `e2e.services.frontend.dependencies`:

```json
{
  "e2e": {
    "services": {
      "fake-payments": { "path": "../fake-payments" },
      "frontend": { "dependencies": { "payments-api": "fake-payments" } }
    }
  }
}
```

The consumer must declare logical dependency `payments-api`; the fake provider needs every referenced app endpoint name. The fake service is not part of dev/prod effective meshes.

## Related

- [Stage-only services](../guides/use-stage-only-services-and-dependencies.md)
- [Dependency substitution](../concepts/dependency-substitution.md)
- [mesh.json](../reference/mesh-json.md)
