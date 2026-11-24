# Development and Release Workflow

Use this workflow for every feature. The personal SQLite catalog at `backend/prisma/dev.db` is the Production database. Never run mutation tests, Stage resets, seed scripts, exploratory writes, or unreviewed migrations against it.

## 1. Create a Feature Branch

Start from current `main`:

```powershell
git switch main
git pull
git switch -c feature-name
```

Use a concise branch name such as `catalog-grid`, `improve-search`, or `fix-local-playback`.

## 2. Develop Locally

Run the normal development servers while working:

```powershell
npm run dev
```

This starts the synthetic Stage API in watch mode and the Vite frontend on loopback ports 3101 and 5174. Seed Stage before the first run. The IIS service explicitly sets production mode and owns the personal database.

## 3. Build and Test

Build both applications first:

```powershell
npm run build
```

Run the full test suite only against the disposable Stage database:

```powershell
npm run stage:reset
npm run stage:dev
```

In a second terminal:

```powershell
npm run test:e2e:stage
```

Stage binds its API and frontend to loopback on ports 3101 and 5174. The API validates the effective dotenv configuration and Stage database path before creating Prisma. Reset only with Stage stopped. The test preflight checks that the direct API and the frontend proxy reach the same seeded Stage instance. See the [Stage test runbook](../e2e/README.md).

### Optional live Discogs compatibility check

Run the automated gate against mocked Stage first. Stop Stage with Ctrl+C, then reset while it is stopped. Use the same checkout and built backend for both modes.

```powershell
npm.cmd run stage:reset
npm.cmd run stage:live-read
```

Before launching live-read, add `STAGE_DISCOGS_READ_TOKEN=<private test token>` to the ignored `backend/.env.stage` file or set that variable in the current shell. The launcher selects the mode. Keep `STAGE_DISCOGS_MODE` out of dotenv files. A missing or malformed token stops startup. Discogs checks whether a configured token is valid on the first live request.

Open http://127.0.0.1:5174 and confirm the live Discogs Stage banner. Scan a known barcode or search by artist/title, select a specific pressing, and verify its label, catalog number, and barcode. A search connection or authentication failure appears separately from a valid empty result. The local catalog remains disposable. Only official Discogs search and selected-release catalog metadata use live requests. Covers, tracklists, marketplace data, and other integrations stay mocked or disabled, and collection sync is disabled in live-read mode. The regular Playwright suite rejects this mode.

For repeatable live smoke coverage, use a public CD pressing with a known barcode and Discogs release ID. This example uses the selected [Queensryche Operation: Mindcrime release](https://www.discogs.com/release/15707771), catalog number `CDP-7-48640-2`. The barcode can return multiple pressings. The smoke test checks that the selected release appears among the candidates. Set these values in a second PowerShell window while live-read Stage is running.

```powershell
$env:STAGE_LIVE_BARCODE = '077774864022'
$env:STAGE_LIVE_RELEASE_ID = '15707771'
npm.cmd run test:e2e:stage:live
```

This local-only suite checks the Stage banner, finds the known pressing by barcode, and validates its release metadata. It uses only GET requests for the Discogs checks and does not save to the catalog. Choose a pressing with a published label, catalog number, and barcode. Discogs metadata and availability can change, so this suite stays outside CI.

To switch back, stop both servers, run `npm.cmd run stage:reset`, and launch `npm.cmd run stage:dev`. Confirm the mocked Discogs banner before rerunning automation.

## 4. Commit and Merge

Commit only the intended changes:

```powershell
git status
git add path\to\changed-file
git commit -m "Describe the change"
```

After review and approval, merge to `main`:

```powershell
git switch main
git merge --no-ff feature-name
```

Push when ready:

```powershell
git push origin main
```

## 5. Apply Database Migrations When Needed

Only do this for a release that adds a checked-in Prisma migration. Make a verified backup first. Replace the example checkout path and LAN address in this runbook with your local values.

```powershell
Stop-Service DiscogsManagerBackend
cd C:\path\to\DiscogsManager\backend
$env:DATABASE_URL = 'file:./dev.db'
try { npx prisma migrate deploy } finally { Remove-Item Env:DATABASE_URL }
cd ..
Start-Service DiscogsManagerBackend
```

Do not use `prisma db push` for the Production catalog.

## 6. Deploy to IIS

Build the merged `main` branch, then use an elevated PowerShell:

```powershell
cd C:\path\to\DiscogsManager
npm run build
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy\deploy-iis-site.ps1 `
  -IisContentPath 'C:\inetpub\DiscogsManager' `
  -BackendServiceName 'DiscogsManagerBackend'
```

The deployment script creates and verifies a timestamped SQLite online backup in `backend/prisma/backups`, copies the frontend to IIS, refreshes `web.config`, and restarts the backend service. Run `npm run deploy:backup` separately for an on-demand backup while IIS stays online. Keep the production database URL out of dotenv so Prisma maintenance requires an explicitly scoped target.

## 7. Verify the Release

Open the permanent application from this PC and phone:

```text
https://<your-lan-ip>/
```

The automatic services should be running:

```powershell
Get-Service DiscogsManagerBackend, W3SVC
```

The backend is intentionally local-only on `127.0.0.1:3100`; IIS is the LAN-facing HTTPS entry point.

## Recovery

If a release fails, stop `DiscogsManagerBackend`, restore the newest appropriate SQLite backup from `backend/prisma/backups` to `backend/prisma/dev.db`, restore prior IIS files if needed, and start the service again.
