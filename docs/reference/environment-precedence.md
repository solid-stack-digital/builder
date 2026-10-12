# Environment precedence

The lists below run from low to high priority. Dotenv files are inputs to their selected stage; `.env.prod` is not merged into `.env.e2e`. E2E does inherit the structured `prod` overlays.

## Ordinary standalone app

```text
.env.<stage>
-> base app.env
-> active-stage app.env
-> active-stage override-compose app environment
-> Builder internal base environment
-> Builder internal active-stage environment
```

## Ordinary mesh app

```text
.env.<stage>
-> base app.env
-> active-stage app.env
-> active-stage override-compose app environment
-> mesh base service env
-> active-stage mesh service env
-> Builder internal base environment
-> Builder internal active-stage environment
```

## Service E2E app

```text
.env.e2e
-> base app.env
-> prod app.env
-> prod override-compose app environment
-> e2e app.env
-> e2e override-compose app environment
-> Builder internal base environment
-> Builder internal E2E environment
```

## Global E2E app

```text
.env.e2e
-> base app.env
-> prod app.env
-> prod override-compose app environment
-> e2e app.env
-> e2e override-compose app environment
-> mesh base service env
-> mesh prod service env
-> mesh e2e service env
-> Builder internal base environment
-> Builder internal E2E environment
```

## E2E tester

```text
.env.e2e-tester
-> tester.env
-> Builder internal tester environment
```

Service E2E app uses `EXEC_MODE=prod`, `INFRA_MODE=integrated`, and target `prod`. The service tester uses `EXEC_MODE=e2e` and no `INFRA_MODE`. Global mesh E2E follows the same app semantics; the root tester uses `EXEC_MODE=e2e`, no `INFRA_MODE`, and root `.env.e2e-tester`.

## Dependencies and references

`dependencies.<name>.env` configures every service in that local dependency implementation when materialized. Substitution suppresses the local implementation. Tester env maps may refer only to effectively published public endpoint properties.

## Related

- [Environment concept](../concepts/environment.md)
- [Export resolved environment](../guides/export-resolved-environment.md)
- [build.json reference](build-json.md)
