FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY checker/package.json checker/package.json
COPY backend/package.json backend/package.json
COPY sandbox/package.json sandbox/package.json
COPY worker/package.json worker/package.json

RUN npm ci --ignore-scripts

COPY shared/ shared/
COPY checker/ checker/

RUN npm run build -w @leetkob/shared && npm run build -w @leetkob/checker

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared/package.json ./shared/package.json
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/checker/package.json ./checker/package.json
COPY --from=builder /app/checker/dist ./checker/dist

USER node

ENTRYPOINT ["node", "checker/dist/cli.js"]
