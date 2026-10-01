# base
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
COPY package*.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# development
FROM base AS dev
RUN touch .env
CMD ["pnpm", "dev"]

# unit & integration testing
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
RUN pnpm build

# production runtime
FROM node:22-alpine AS prod
WORKDIR /app
RUN corepack enable
COPY package*.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

HEALTHCHECK --interval=2s --timeout=2s --start-period=3s --retries=10 \
  CMD ["node", "-e", "require('net').connect(process.env.PORT || 3001, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"]

CMD ["node", "dist/index.js"]
