# Environment precedence

## Standalone app (low to high)

1. `.env.<stage>` values provided to Compose.
2. Base `build.json.app.env`.
3. Active build-stage `app.env`.
4. Active stage's `override-compose` app environment.
5. Builder-owned runtime values (authoritative; conflicts fail).

## Mesh app (low to high)

1. `.env.<stage>`.
2. Base build app env.
3. Active build-stage app env.
4. Active build-stage override Compose env.
5. Base mesh service `env`.
6. Active mesh-stage service `env`.
7. Builder-owned base values.
8. Builder-owned active-stage values.

## Dependencies and testers

`dependencies.<name>.env` configures its local implementation when integrated. Substitution suppresses that implementation; the provider uses its own app env. Service tester env is `build.json.tester.env`; global tester env is `mesh.json.tester.env`. Both tester roles may reference only effectively published public endpoint properties.

## E2E selection

E2E runtime uses `.env.e2e`, build `e2e`, and mesh `e2e`. The app image is built from Dockerfile target `prod`. `.env.prod`, `prod.app.env`, and `mesh.prod` do not flow into E2E automatically.

## Related

- [Environment concept](../concepts/environment.md)
- [Export resolved environment](../guides/export-resolved-environment.md)
- [build.json reference](build-json.md)
