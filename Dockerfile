# The app has no npm dependencies, so a single stage is enough: just Node and the source.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

# The SQLite database lives in /data; everything else can be read-only
RUN mkdir /data && chown node:node /data
VOLUME /data

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1

CMD ["node", "server/index.js"]
