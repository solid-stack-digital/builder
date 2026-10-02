# base
FROM node:22-alpine AS base
WORKDIR /app
ENV COREPACK_HOME=/usr/local/share/.cache/corepack
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# development
FROM base AS dev
COPY --chown=node:node . .
USER node
CMD ["pnpm", "dev"]

# testing
FROM base AS test
COPY --chown=node:node . .
USER node
CMD ["pnpm", "test"]

# production dependencies
FROM base AS prod-deps
RUN pnpm install --prod --frozen-lockfile

# production build
FROM base AS builder
COPY --chown=node:node . .
RUN pnpm build

# production package verification
FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=builder /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/templates ./templates
USER node
CMD ["node", "dist/bin.js", "--version"]

