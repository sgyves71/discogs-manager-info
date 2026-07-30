# Playwright end-to-end workspace

This workspace is for browser navigation and local backend API checks. It deliberately starts as read-only against the currently running development servers.

## One-time setup

```powershell
npm install
npm run install:browsers --workspace e2e
```

## Run

Start the application first, then run one of:

```powershell
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:api
```

The defaults are `https://localhost:5173` and `http://localhost:3100`. Override them with `E2E_APP_URL` and `E2E_API_URL` when needed.

## Next phase

Before adding mutation tests, create a dedicated test SQLite database, test-only seed data, and mocked Discogs/eBay responses. The test suite must never write to the personal collection database.
