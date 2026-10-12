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

The tester Compose file may contain helper services referenced by the runner. `tester.service` must identify the selected finite runner exactly; Builder does not infer the first service. Tester env may use only public endpoint properties, so publish every service endpoint that the external runner needs. Tester services using `extends` are rejected because inherited networking/ports cannot be safely validated for the host-side runner. The root tester is required for global mesh E2E and `mesh up test`; `builder mesh check` permits it to be absent unless `--require-tester` is supplied.

```bash
builder mesh check --require-tester
builder mesh up test-e2e
builder mesh up test
```

Mesh E2E uses `mesh.e2e`, service build `e2e` runtime configuration, and the app `prod` image target. It does not use `mesh.prod` overlays.

## Related

- [Testing model](../concepts/testing-model.md)
- [Global tester fields](../reference/mesh-json.md)
- [Tester troubleshooting](../troubleshooting/tests-and-testers.md)
