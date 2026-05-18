FROM caddy:2.8-alpine AS caddy-bin

FROM node:26-alpine

COPY --from=caddy-bin /usr/bin/caddy /usr/bin/caddy

WORKDIR /app

# better-sqlite3: no musl prebuild for many Node versions; compile needs gyp toolchain
RUN apk add --no-cache python3 make g++ sqlite-dev

COPY package*.json ./

RUN npm ci

COPY app/admin/frontend/ ./app/admin/frontend/
COPY vite.config.js ./
RUN npm run build

RUN npm prune --production

COPY app/ ./app/
COPY start.js ./
COPY scripts/ ./scripts/
COPY docker/ ./docker/

RUN chmod +x /app/docker/entrypoint.sh /app/docker/entrypoint-gateway.sh

VOLUME ["/app/db"]

EXPOSE 80 443 8080 8443 8081 8082

ENTRYPOINT ["/app/docker/entrypoint.sh"]
