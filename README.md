# Medieval Scribe
Web app that converts your Dutch text into medieval looking Dutch while you type.

## Development
Requires Node.js 22 or newer. There are no dependencies to install.

```bash
npm run dev    # serves the app at http://localhost:8080
npm test       # runs the converter tests
```

## How the conversion works
The converter lives in [`public/js/scribe`](public/js/scribe) and runs in the browser:

- **Dictionary** ([`dictionary.js`](public/js/scribe/dictionary.js)): swaps modern words for medieval ones (`fiets` → `stalen ros`).
  Plurals and diminutives of nouns are derived automatically (`fietsen` → `stalen rossen`, `zonnetje` → `hemelvlammetje`).
- **Spelling rules** ([`spelling.js`](public/js/scribe/spelling.js)): respell all other words (`mijn` → `myn`, `ik` → `ick`, `huis` → `huysch`).
- Capital letters are kept, and while typing only the words around the edit are converted again.
