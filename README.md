# Discogs Manager

Discogs Manager is a local-first application for cataloging a CD collection. It associates physical CDs with specific Discogs releases, supports barcode lookup and catalog corrections, and keeps the collection database and music files on the owner's computer.

The engineering focus is testing the real application end to end while keeping test data and external services isolated. The application uses React and TypeScript, an Express API, and Prisma with SQLite. Playwright exercises the UI and API against synthetic Stage data.

## Start here

| Evidence | What to look for |
| --- | --- |
| [Architecture](docs/architecture.md) | Follow the UI, API, and database boundaries. See how Stage validates the database path and confirms that direct API calls and browser traffic reach the same backend. |
| [Demo 1: Catalog workflow](docs/demo-one.md) | Find and save a release, edit it, reject a duplicate with HTTP 409, and read the catalog again to verify one corrected record. |
| [Demo 2: Discogs sync recovery](e2e/README.md#demo-2-discogs-sync-recovery) | A fixture times out before adding a release. Verify the saved failure, retry from the UI, and confirm the same record syncs without adding a second copy. |
| [Passing Windows CI run](https://github.com/sgyves71/discogs-manager-info/actions/runs/45317291925) | Both demos run in separate Windows jobs with fresh databases. Each job runs the build, backend tests, and Stage safety checks. |
| [Controlled CI failure](https://github.com/sgyves71/discogs-manager-info/actions/runs/45295006017) | An intentionally incorrect assertion fails on a separate branch. GitHub still collects the Playwright report, trace, and Stage logs. Artifacts have a seven-day retention period. |

## Run the demos on Windows

Use a clean checkout with Node 24.18.0 and ports 3101 and 5174 available. From the repository root:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run install:browsers --workspace e2e
powershell.exe -NoProfile -File scripts/verify-ci-stage.ps1 -Demo one
powershell.exe -NoProfile -File scripts/verify-ci-stage.ps1 -Demo two
```

Each invocation seeds a fresh synthetic database, verifies Stage identity, and stops its servers after the test. The demos require no live account credentials. See the [Stage runbook](e2e/README.md) for the regression suite and manual setup.

Demo 1 covers sequential duplicate rejection. Concurrent catalog insertion, live integrations, and production playback are outside this demo evidence. The source is public. The personal collection and production installation stay local.
