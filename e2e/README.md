# Playwright end-to-end workspace

This workspace covers browser navigation, API requests, and catalog mutations. Run the suite against disposable Stage data. Opening some app views can trigger persistence.

## One-time setup

```powershell
npm install
npm run install:browsers --workspace e2e
```

## Run

From the repository root, with Stage stopped:

```powershell
npm run build
node --test scripts/tests/stage-safety.test.mjs
npm run stage:reset
npm run stage:dev
```

In a second terminal:

```powershell
npm run test:e2e:stage
npm run test:e2e:stage -- --demo-one
```

The Stage API binds to `127.0.0.1:3101` and the frontend to `127.0.0.1:5174`. Stage uses HTTPS when both local Vite certificate files exist and HTTP otherwise. Playwright checks the synthetic catalog and compares the backend identity through the direct API and the frontend proxy before starting any Stage test. The demo runs separately because the other suites count or scan the shared fixture rows.

Reset Stage while its servers are stopped before each full-suite run. The suite uses one worker and zero retries because the tests share a SQLite file and some operations scan or update the entire catalog.

Keep the first failed run's `e2e/playwright-report` and `e2e/test-results` before rerunning. See [Demo 1 baseline and reviewer workflow](../docs/demo-one.md) for expectations and current results.
