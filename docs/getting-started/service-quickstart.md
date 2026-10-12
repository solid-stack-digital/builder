# Run your first service

Create a service project with `build.json`, `Dockerfile`, and `server.mjs`. `app` is required, even when it has no other fields. This example names one HTTP endpoint:

```json
{
  "app": {
    "endpoints": {
      "http": { "port": 3000, "publicPort": "AUTO", "primary": true, "scheme": "http" }
    }
  }
}
```

Create `server.mjs`:

```js
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);
createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end(request.url === "/health" ? "ok" : "Hello from Builder\n");
}).listen(port, "0.0.0.0");
```

Create `Dockerfile`:

```dockerfile
FROM node:22-alpine AS source
WORKDIR /app
COPY server.mjs ./server.mjs

FROM source AS dev
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.mjs"]

FROM source AS test
CMD ["node", "-e", "console.log('unit tests pass')"]

FROM source AS test-e2e
CMD ["node", "-e", "console.log('service E2E pass')"]

FROM source AS builder
RUN mkdir -p /out && cp server.mjs /out/server.mjs

FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=builder /out/server.mjs ./server.mjs
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.mjs"]
```

The endpoint's `port` is inside the container. `publicPort: "AUTO"` asks Builder to choose a host port. The primary endpoint supplies Builder's `PORT` environment value. URL construction uses `scheme`.

The Dockerfile must provide the `dev`, `test`, `test-e2e`, and `prod` targets. For a dev run, `dev` needs a foreground command and healthcheck. See the [Dockerfile contract](../reference/dockerfile-contract.md).

```bash
builder check
builder service up dev
```

Read the resolved host URL from a Builder reference/export rather than assuming that host port 3000 was selected. Use Ctrl+C to stop a foreground run, or run `builder service down dev`. From a parent directory:

```bash
builder service up dev -C ./hello-service
```

See [endpoints](../concepts/endpoints.md), [stages](../concepts/stages.md), [CLI](../reference/cli.md), and the complete [build.json reference](../reference/build-json.md).

## Related

- [Installation](installation.md)
- [Develop a service](../guides/develop-a-service.md)
- [build.json](../reference/build-json.md)
