# Distroless: only the Node runtime, with no shell, package manager or other tools,
# so a compromised app has nothing to work with. It runs as user 65532 ("nonroot"),
# which doesn't exist on the host.
FROM busybox:1.37 AS prepare
RUN mkdir /data

FROM gcr.io/distroless/nodejs24-debian12:nonroot

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

# The SQLite database lives in /data; everything else can be read-only
COPY --from=prepare --chown=65532:65532 /data /data
VOLUME /data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD ["/nodejs/bin/node", "server/healthcheck.js"]

# The image's entrypoint is node itself
CMD ["--disable-warning=ExperimentalWarning", "server/index.js"]
