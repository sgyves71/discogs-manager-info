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

This starts the Vite frontend at `https://localhost:5173/` and the development API at port 3100. For phone testing during development, use the current LAN URL with port 5173. Do not use the development servers for permanent day-to-day access; IIS now serves the deployed application at `https://192.168.68.50/`.

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

Stage runs its API on port 3101 and frontend on port 5174. It uses `backend/prisma/stage.db`, which can be reset and mutated safely. Stop its servers after testing.

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
npx prisma migrate deploy
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

The deployment script creates a timestamped backup in `backend/prisma/backups`, copies the built frontend to IIS, refreshes `web.config`, and restarts the persistent backend service. It does not overwrite the Production database or `backend/.env`.

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
