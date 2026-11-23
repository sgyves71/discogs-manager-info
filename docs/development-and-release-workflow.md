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

Only do this for a release that adds a checked-in Prisma migration. The deployment backup step below must happen first.

```powershell
Stop-Service DiscogsManagerBackend
cd D:\VSProjects\DiscogsManager\backend
$env:DATABASE_URL = 'file:./dev.db'
try { npx prisma migrate deploy } finally { Remove-Item Env:DATABASE_URL }
cd ..
Start-Service DiscogsManagerBackend
```

Do not use `prisma db push` for the Production catalog.

## 6. Deploy to IIS

Build the merged `main` branch, then use an elevated PowerShell:

```powershell
cd D:\VSProjects\DiscogsManager
npm run build
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy\deploy-iis-site.ps1 `
  -IisContentPath 'C:\inetpub\DiscogsManager' `
  -BackendServiceName 'DiscogsManagerBackend'
```

The deployment script creates and verifies a timestamped SQLite online backup in `backend/prisma/backups`, copies the frontend to IIS, refreshes `web.config`, and restarts the backend service. Run `npm run deploy:backup` separately for an on-demand backup while IIS stays online. Keep the production database URL out of dotenv so Prisma maintenance requires an explicitly scoped target.

## 7. Verify the Release

Open the permanent application from this PC and phone:

```text
https://192.168.68.50/
```

The automatic services should be running:

```powershell
Get-Service DiscogsManagerBackend, W3SVC
```

The backend is intentionally local-only on `127.0.0.1:3100`; IIS is the LAN-facing HTTPS entry point.

## Recovery

If a release fails, stop `DiscogsManagerBackend`, restore the newest appropriate SQLite backup from `backend/prisma/backups` to `backend/prisma/dev.db`, restore prior IIS files if needed, and start the service again.
