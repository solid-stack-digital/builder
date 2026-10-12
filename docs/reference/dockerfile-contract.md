# Dockerfile contract

The service Dockerfile defaults to `Dockerfile`; `build.json.dockerfile` may select another relative path. Required target aliases are `dev`, `test`, `test-e2e`, and `prod`.

| Target | User-visible contract |
|---|---|
| `dev` | Long-running foreground app and valid enabled healthcheck. |
| `test` | Finite unit/integration runner; no healthcheck required. |
| `test-e2e` | Finite service-level E2E runner; no healthcheck required. |
| `prod` | Production runtime, valid enabled healthcheck, and artifact isolation using build-stage copies. |

Do not hardcode `EXPOSE` as endpoint ownership and port wiring come from Builder endpoints. Runtime targets should stay in the foreground. Apps with a primary endpoint receive Builder-owned `PORT`; readiness checks should use the effective port rather than assume a different one. Finite test targets may disable an inherited healthcheck.

Conceptual shape:

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

FROM base AS dev
HEALTHCHECK CMD node healthcheck.js
CMD ["npm", "run", "dev"]

FROM base AS test
CMD ["npm", "test"]

FROM base AS test-e2e
CMD ["npm", "run", "test:e2e"]

FROM base AS builder
RUN npm run build

FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=builder /app/dist ./dist
HEALTHCHECK CMD node dist/healthcheck.js
CMD ["node", "dist/server.js"]
```

## Related

- [Service quickstart](../getting-started/service-quickstart.md)
- [build.json](build-json.md)
- [Healthcheck troubleshooting](../troubleshooting/healthchecks-and-startup.md)
