# base
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# development
FROM base AS dev
COPY . .
USER node
CMD ["pnpm", "dev"]

# testing
FROM base AS test
COPY . .
USER node
CMD ["pnpm", "test"]

# production build
FROM base AS builder
COPY . .
RUN pnpm build

# production package verification
FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/templates ./templates
USER node
CMD ["node", "dist/bin.js", "--version"]
