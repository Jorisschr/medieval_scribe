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
