# Configure environment values

Builder-managed JSON environment maps accept strings only. Quote numbers and booleans if they are intended as text. Nulls, arrays, and objects are invalid. `${...}` in Builder JSON environment is endpoint-reference syntax; raw `override-compose` environment remains Compose environment syntax.

App values may come from `app.env`, a build stage's `app.env`, `.env.<stage>`, an active `override-compose`, mesh service `env`, and Builder-owned runtime values. The exact precedence is listed in [environment precedence](../reference/environment-precedence.md). Mesh layers apply only in mesh execution; an active mesh value can replace a service project's value.

Other environment locations:

- `dependencies.<name>.env` configures every service in that local dependency implementation when materialized.
- `build.json.tester.env` configures the service-level E2E runner.
- `mesh.json.services.<name>.env` configures that mesh app service.
- `mesh.json.tester.env` configures the selected global runner.
- `.env.dev`, `.env.prod`, `.env.test`, and `.env.e2e` are stage dotenv layers.

Builder-owned values such as `EXEC_MODE`, `INFRA_MODE`, and app `PORT` (when a primary endpoint exists) cannot be overridden. Runtime env does not become Docker build args; use the documented override Compose `build.args` capability for explicit build-time arguments.

## Related

- [Environment precedence](../reference/environment-precedence.md)
- [Endpoint references](endpoint-references.md)
- [Export resolved environment](../guides/export-resolved-environment.md)
