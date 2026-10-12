# Configure global mesh E2E

Root `mesh.json.tester` selects a Compose implementation and its exact runner service:

```json
{
  "tester": {
    "compose": "e2e/tester.yml",
    "service": "runner",
    "env": { "BASE_URL": "${gateway.app.endpoints.http.public_url}" }
  },
  "services": { "gateway": { "path": "../gateway", "publish": ["app.endpoints.http"] } }
}
```

`tester.compose` points directly to the tester Compose file; `tester.service` selects the finite runner and exit-code source. The file may include setup and helper services, which remain part of the tester implementation. Builder host-networks only the selected runner. The selected runner receives the root `.env.e2e-tester`, `tester.env`, and Builder-owned `EXEC_MODE=e2e`; it receives no `INFRA_MODE`.

Tester env may use only effectively published public endpoint properties, so publish every service endpoint the external runner needs. The root tester is required for global mesh E2E and `mesh up test`; `builder mesh check` permits it to be absent unless `--require-tester` is supplied.

```bash
builder mesh check --require-tester
builder mesh up test-e2e
builder mesh up test
```

Global E2E resolves mesh and service configuration as `base -> prod -> e2e`. Applications run target `prod` with `EXEC_MODE=prod`, `INFRA_MODE=integrated`, and each service's `.env.e2e`; `.env.prod` is not merged into `.env.e2e`.

## Related

- [Testing model](../concepts/testing-model.md)
- [Global tester fields](../reference/mesh-json.md)
- [Tester troubleshooting](../troubleshooting/tests-and-testers.md)
