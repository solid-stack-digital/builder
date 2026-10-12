# base
FROM nginx:alpine AS base
# hadolint ignore=DL3018,DL3016
RUN apk add --no-cache nodejs npm && npm install -g pnpm@11.18.0
WORKDIR /app
COPY templates /etc/nginx/templates
COPY package*.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# development
FROM base AS dev
HEALTHCHECK --interval=2s --timeout=2s --start-period=3s --retries=10 \
  CMD ["node", "-e", "const p=Number(process.env.PORT); if(!p) process.exit(1); const s=require('net').connect(p,'127.0.0.1'); s.on('connect',()=>{s.end();process.exit(0)}); s.on('error',()=>process.exit(1));"]
CMD ["nginx", "-g", "daemon off;"]

# unit testing
FROM base AS test
COPY . .
CMD ["pnpm", "test"]

# e2e testing
FROM base AS test-e2e
COPY . .
CMD ["pnpm", "test:e2e"]

# production build
FROM base AS builder
COPY . .

# production runtime
FROM nginx:alpine AS prod
# hadolint ignore=DL3018
RUN apk add --no-cache nodejs
COPY --from=builder /etc/nginx/templates /etc/nginx/templates

HEALTHCHECK --interval=2s --timeout=2s --start-period=3s --retries=10 \
  CMD ["node", "-e", "const p=Number(process.env.PORT); if(!p) process.exit(1); const s=require('net').connect(p,'127.0.0.1'); s.on('connect',()=>{s.end();process.exit(0)}); s.on('error',()=>process.exit(1));"]

CMD ["nginx", "-g", "daemon off;"]
