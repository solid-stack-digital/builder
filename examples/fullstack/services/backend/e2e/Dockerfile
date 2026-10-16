FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable
COPY package*.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "test:e2e"]
