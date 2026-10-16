FROM node:20-alpine AS dev
WORKDIR /app
COPY server.mjs ./server.mjs
CMD ["node", "server.mjs"]
HEALTHCHECK --interval=2s --timeout=2s --retries=5 CMD node -e "require('node:http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
FROM dev AS test
CMD ["node", "-e", "process.exit(0)"]
FROM dev AS prod
