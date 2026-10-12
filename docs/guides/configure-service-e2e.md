# Configure service-level E2E

Service-level E2E runs an app with its local dependencies and a finite Dockerfile `test-e2e` tester. Configure `build.json.tester.env` for the tester. Because the tester is a host-side client, it may reference only effectively published public endpoint properties. The app endpoint must declare `publicPort`.

The E2E app inherits structured configuration as `base -> prod -> e2e`, runs target `prod` with `EXEC_MODE=prod` and `INFRA_MODE=integrated`, and loads `.env.e2e`. It does not load or merge `.env.prod`. The tester runs target `test-e2e` with `EXEC_MODE=e2e`, no `INFRA_MODE`, and `.env.e2e-tester`.

```json
{
  "app": { "endpoints": { "http": { "port": 3000, "publicPort": "AUTO", "primary": true, "scheme": "http" } } },
  "tester": { "env": { "APP_URL": "${app.endpoints.http.public_url}" } }
}
```

`network_url` is invalid in tester env because the tester is outside the app network; use `public_url`. Run `builder service up test-e2e`, or `builder service up test` to run unit tests first and E2E only after unit success.

## Related

- [Testing model](../concepts/testing-model.md)
- [Endpoint properties](../reference/endpoint-properties.md)
- [Stage matrix](../reference/stage-matrix.md)
