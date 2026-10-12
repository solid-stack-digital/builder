# Configure service-level E2E

Service-level E2E runs one app with its local dependencies and its Dockerfile `test-e2e` runner. Configure `build.json.tester.env` for the runner. Because it is a host-side client, it may reference only public endpoint properties; the app endpoint must have `publicPort` and be effectively published.

The app uses Dockerfile target `prod` with runtime overlay `e2e` and `.env.e2e`. It does not inherit prod runtime env. Local endpoint-bearing dependencies are integrated.

```json
{
  "app": { "endpoints": { "http": { "port": 3000, "publicPort": "AUTO", "primary": true, "scheme": "http" } } },
  "tester": { "env": { "BASE_URL": "${app.endpoints.http.public_url}" } }
}
```

`network_url` is invalid in tester env because the tester is outside the app network; use `public_url`. Run `builder service up test-e2e`, or `builder service up test` to run unit tests first and E2E only after unit success.

## Related

- [Testing model](../concepts/testing-model.md)
- [Endpoint properties](../reference/endpoint-properties.md)
- [Stage matrix](../reference/stage-matrix.md)
