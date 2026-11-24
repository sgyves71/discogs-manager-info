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

## Demo 2: Discogs sync recovery

Start from a freshly seeded Stage database and a newly started Stage backend, then run:

```powershell
npm run test:e2e:stage -- --demo-two
```

The test creates synthetic release `900199`. The Stage Discogs client times out on its first add before modifying the simulated collection. The test checks the saved `FAILED` record and the visible timeout feedback, retries from the Music Library page, and checks the same catalog record is now `SYNCED`. A third sync confirms the fixture collection already contains the release and adds nothing. The test deletes its temporary catalog record.

Restart and reseed between runs. The fixture collection and one-time timeout live in the Stage backend process, and the sync processes the whole synthetic catalog. Demo 2 runs separately from the Chromium regression suite.

## Windows CI

The [Windows CI workflow](../.github/workflows/ci.yml) runs on pull requests and manual dispatch. Each demo runs in its own Windows job. Each job checks the build, backend tests, and Stage guards, then seeds a fresh database, verifies direct and proxied identity, and runs its Chromium demo. The Stage script stops the listeners whether the browser test passes or fails. Each job uploads its own Stage logs and Playwright diagnostics.

To reproduce the Stage step on Windows, use a clean source copy with dependencies installed, a fresh build, Chromium installed through the e2e workspace, and ports 3101 and 5174 free. Run `powershell.exe -NoProfile -File scripts/verify-ci-stage.ps1 -Demo one` or use `-Demo two` from the repository root. The script refuses local dotenv files, certificates, and the personal database.
