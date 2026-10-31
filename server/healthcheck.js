// Used by the Docker health check, since the image has no curl or wget
const port = Number(process.env.PORT) || 8080;

try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(2000) });
    process.exit(response.ok ? 0 : 1);
} catch {
    process.exit(1);
}
