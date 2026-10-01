# base
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# development
FROM base AS dev
COPY . .
CMD ["pnpm", "dev"]

# testing
FROM base AS test
COPY . .
CMD ["pnpm", "test"]

# production build
FROM base AS builder
COPY . .
RUN pnpm build
CMD ["pnpm", "build"]

# production package verification
FROM base AS prod
COPY --from=builder /app/dist ./dist
CMD ["pnpm", "test"]
