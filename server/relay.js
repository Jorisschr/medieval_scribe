// Forwards TCP connections to the app, which runs on an internal Docker network with
// no route to the internet or your home network. This relay is the only container that
// is reachable from outside; it passes bytes along and understands nothing else.
import { connect, createServer } from 'node:net';

const listenPort = Number(process.env.PORT) || 8080;
const [targetHost, targetPort] = (process.env.RELAY_TARGET || 'scribe:8080').split(':');

const server = createServer(client => {
    const upstream = connect(Number(targetPort), targetHost);
    const close = () => {
        client.destroy();
        upstream.destroy();
    };
    client.on('error', close).on('close', close);
    upstream.on('error', close).on('close', close);
    client.pipe(upstream).pipe(client);
});

server.maxConnections = 500;
server.listen(listenPort, '0.0.0.0', () => {
    console.log(`Relay listening on ${listenPort}, forwarding to ${targetHost}:${targetPort}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
