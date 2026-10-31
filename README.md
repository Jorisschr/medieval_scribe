# Medieval Scribe
Web app that converts your Dutch text into medieval looking Dutch while you type.

## Development
Requires Node.js 24 or newer. There are no dependencies to install.

```bash
cp .env.example .env   # then choose an admin password and set PUBLIC_URL=http://localhost:8080
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
The app has no dependencies besides Node and uses about 35 MB of memory in total. It is published on
port **8473** of the server, and only on `127.0.0.1`, so it doesn't clash with other containers and isn't
reachable from your network directly.

### First install
```bash
git clone https://github.com/Jorisschr/medieval_scribe.git
cd medieval_scribe
cp .env.example .env
openssl rand -base64 24   # a good admin password
nano .env                 # fill in ADMIN_USERNAME, ADMIN_PASSWORD and PUBLIC_URL
docker compose up -d --build
```

Check that it runs:

```bash
docker compose ps                         # both containers should say "healthy" after a few seconds
curl http://127.0.0.1:8473/healthz        # should print "ok"
```

The database lives in the `scribe-data` volume. Settings in `.env`:

| Setting | Meaning |
|---|---|
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Your admin account. Changing the password here and restarting resets it. |
| `PUBLIC_URL` | The public address, e.g. `https://scribe.example.com`. Used in invite links; `https` turns on secure cookies. |
| `HOST_PORT` | Port on the server, default `8473`. |
| `BIND_ADDRESS` | Default `127.0.0.1`. Use `0.0.0.0` only if the tunnel runs on another machine in your network. |

### Security
Even if someone found a way into the app, the container gives them nothing to work with:

- **No network access.** The app runs on an internal Docker network with no route to the internet, your
  home network, the server or other containers. A second container, `medieval-scribe-gateway`, only passes
  the tunnel's connections through to it.
- **A user that doesn't exist on the server** (65532), with no Linux capabilities, no way to gain
  privileges, and Docker's system call filter.
- **Read-only filesystem.** The only writable places are the database volume and a small `/tmp` where
  nothing can be executed.
- **Nothing to work with.** The image is "distroless": only the Node runtime, no shell, package manager
  or tools like `curl`.
- **Limits** on memory, CPU and the number of processes.

Rebuild now and then with `docker compose build --pull` to pick up security fixes in Node.

### Updating
```bash
cd medieval_scribe
git pull
docker compose up -d --build
```

Accounts, invites and logins are kept, since they live in the volume.

**Once, when updating from a version that ran as user 1000** (before the hardened setup), the database
has to be handed to the new user. Without it the app stops and its log (`docker compose logs scribe`)
says so:

```bash
docker compose down
docker run --rm -v medieval_scribe_scribe-data:/data busybox:1.37 chown -R 65532:65532 /data
docker compose up -d --build
```

The volume is named after the folder you cloned into; `docker volume ls` shows its exact name.

### Do I need sudo?
Docker commands talk to the Docker daemon, which runs as root, so they need either `sudo` or membership
of the `docker` group. That is only about who may *control* Docker: running `sudo docker compose` gives the
containers no extra rights, so the app is just as locked down either way.

Adding yourself to the `docker` group (`sudo usermod -aG docker $USER`, then log in again) saves typing
`sudo`, but makes your account root-equivalent without a password prompt. Keeping `sudo` is the safer
choice. To take the daemon itself out of root, look into
[rootless Docker](https://docs.docker.com/engine/security/rootless/), which applies to all your containers.

### Making it reachable with a Cloudflare Tunnel
A tunnel needs no open ports on your router and hides your home IP. Cloudflare handles HTTPS.
Your domain must use Cloudflare for its DNS.

1. In the Cloudflare dashboard, open **Zero Trust → Networks → Tunnels** (Cloudflare moves this around
   now and then; search for "Tunnels" if it isn't there). If you already have a tunnel for this server, for
   example for Home Assistant, reuse it and skip to step 3.
2. **Create a tunnel** of type *Cloudflared*, give it a name, and pick *Docker* as the environment. The
   dashboard shows a `docker run ... --token ...` command. Run it on the server with `--network host` added,
   so the connector can reach `127.0.0.1`:

   ```bash
   docker run -d --name cloudflared --restart unless-stopped --network host      cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <TOKEN FROM THE DASHBOARD>
   ```

   The tunnel should turn *Healthy* in the dashboard.
3. Add a **public hostname** (called *published application route* in newer dashboards) to the tunnel:
   - Subdomain `scribe`, your domain
   - Service type **HTTP**, URL `localhost:8473`
4. Set `PUBLIC_URL=https://scribe.yourdomain.com` in `.env` and run `docker compose up -d` again.
5. Open the address, log in with your admin account and make invites on the **Beheer** page.

If your `cloudflared` container is already running **without** `--network host` (on its own Docker
network), it can't see `127.0.0.1` of the server. Then attach the gateway to that network instead: create a
`docker-compose.override.yml` next to `docker-compose.yml` (git ignores it):

```yaml
services:
  gateway:
    networks: [isolated, default, tunnel]

networks:
  tunnel:
    external: true
    name: cloudflared_default   # the network your cloudflared container is on: docker network ls
```

and use `http://medieval-scribe-gateway:8080` as the service URL in step 3.

Never forward port 8473 on your router: the app trusts the tunnel to report each visitor's IP address,
which it needs to block password guessing.

### Alternative: Caddy
If you prefer to host HTTPS yourself, point a DNS record at your home IP, forward ports 80 and 443 to the
server, and use this `Caddyfile`:

```
scribe.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8473
}
```

### Backups
Everything lives in a single SQLite database in the volume. To back it up:

```bash
docker compose stop
docker run --rm -v "$(basename "$PWD")_scribe-data:/data" -v "$PWD:/backup" alpine tar czf /backup/scribe-backup.tgz -C /data .
docker compose start
```

## Credits
- Fonts: [UnifrakturMaguntia](https://fonts.google.com/specimen/UnifrakturMaguntia),
  [Uncial Antiqua](https://fonts.google.com/specimen/Uncial+Antiqua) and
  [Pirata One](https://fonts.google.com/specimen/Pirata+One), under the SIL Open Font License (see `public/fonts`).
- Table texture: [Dark Wooden Planks](https://polyhaven.com/a/dark_wooden_planks) by Amal Kumar, Poly Haven (CC0).
