# Medieval Scribe
Web app that converts your Dutch text into medieval looking Dutch while you type.

## Development
Requires Node.js 24 or newer. There are no dependencies to install.

```bash
cp .env.example .env   # then choose an admin password
npm run dev            # serves the app at http://localhost:8080, restarting on changes
npm test               # runs the converter and server tests
```

## Accounts and invites
The app is only available after logging in. The admin account is created on first start from
`ADMIN_USERNAME` and `ADMIN_PASSWORD`; changing `ADMIN_PASSWORD` later resets its password.

Everyone else joins through an invite link made on the **Beheer** page:

- **Aantal personen**: 1 for a personal link, more for a group link
- **Geldig (dagen)**: how long the link works
- Links can be revoked, and users deleted, from the same page

Invite links and sessions are stored only as hashes, so a link is shown just once when it is created.
Data lives in a SQLite database in `DATA_DIR` (default `data/`).

All settings are listed in [`.env.example`](.env.example).

## How the conversion works
The converter lives in [`public/js/scribe`](public/js/scribe) and runs in the browser:

- **Dictionary** ([`dictionary.js`](public/js/scribe/dictionary.js)): swaps modern words for medieval ones (`fiets` → `stalen ros`).
  Plurals and diminutives of nouns are derived automatically (`fietsen` → `stalen rossen`, `zonnetje` → `hemelvlammetje`).
- **Spelling rules** ([`spelling.js`](public/js/scribe/spelling.js)): respell all other words (`mijn` → `myn`, `ik` → `ick`, `huis` → `huysch`).
- Capital letters are kept, and while typing only the words around the edit are converted again.

## Running on a server with Docker
The image is Node on Alpine plus the app; it has no other dependencies and uses about 20 MB of memory.

1. Copy the repository to the server and create a `.env` next to `docker-compose.yml`:

   ```bash
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=a-long-random-password
   PUBLIC_URL=https://scribe.example.com
   ```

2. Start it:

   ```bash
   docker compose up -d --build
   ```

The container only listens on `127.0.0.1:8080` (change it with `HOST_PORT`), runs as a non-root user with a
read-only filesystem, and keeps its database in the `scribe-data` volume. To update, pull the new code and run
the same command again.

### Making it reachable from the internet
The app needs HTTPS: secure cookies and the copy button depend on it. Put one of these in front of it:

**Caddy** gets and renews a certificate automatically. Point a DNS record at your home IP, forward ports 80 and
443 on your router to the server, and use this `Caddyfile`:

```
scribe.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
}
```

**Cloudflare Tunnel** needs no open ports on your router and hides your home IP. Create a tunnel in the
Cloudflare dashboard with a public hostname pointing to `http://localhost:8080`, and run `cloudflared` on the
server as the dashboard describes.

If your proxy runs in a Docker container itself, `127.0.0.1` points at the proxy's own container: put both
containers on one Docker network and use `medieval-scribe:8080` as the address instead.

Either way, set `PUBLIC_URL` to the public address so invite links point to the right place.
Never publish port 8080 directly to the internet: the app trusts the proxy to report the visitor's IP address.

### Backups
Everything lives in a single SQLite database in the volume. To back it up:

```bash
docker compose stop
docker run --rm -v "$(basename "$PWD")_scribe-data:/data" -v "$PWD:/backup" alpine tar czf /backup/scribe-backup.tgz -C /data .
docker compose start
```
