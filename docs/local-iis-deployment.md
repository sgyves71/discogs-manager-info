# Local IIS Deployment

This runbook makes Discogs Manager available after VS Code and development terminals are closed. It remains a private home-network application: IIS serves the built frontend, and a local Node service owns the API and SQLite catalog.

## Intended Topology

```text
Browser on this PC or phone
        |
        v
IIS HTTPS site on <your-lan-ip>:443
  - static files from frontend/dist
  - /api reverse proxy to 127.0.0.1:3100
        |
        v
Discogs Manager Node backend Windows service
  - backend/dist/index.js
  - backend/prisma/dev.db
```

The backend must bind to `127.0.0.1`, not the LAN address. IIS is the only network-facing component. This keeps the API private while still allowing phone access through the IIS site.

## One-Time Prerequisites

1. Install IIS with **Web Server > Common HTTP Features > Static Content**.
2. Install IIS **URL Rewrite** and **Application Request Routing (ARR)**. In IIS Manager, open **Application Request Routing Cache > Server Proxy Settings** and enable **Proxy**. The supplied `deploy/iis/web.config` relies on this.
3. Keep Node.js installed at its current stable location. The backend service runs `node backend/dist/index.js`.
4. Install [NSSM](https://nssm.cc/) to run the backend as a recoverable Windows service. Do not use a development `npm run dev` process for the permanent service.
5. Obtain an IIS HTTPS certificate that includes `<your-lan-ip>`. A certificate trusted by the iPhone is required for camera access. Your existing mkcert certificate can be exported as a PFX for IIS, or a new IIS certificate can be created and trusted on each phone.

## Configure the Backend Service

Replace the example checkout path and LAN address with your local values. Build once first:

```powershell
cd C:\path\to\DiscogsManager
npm run build
```

Ensure `backend/.env` contains the existing private keys plus:

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=3100
```

From an elevated PowerShell, use NSSM. Adjust the NSSM location if needed:

```powershell
nssm install DiscogsManagerBackend "C:\Program Files\nodejs\node.exe" "C:\path\to\DiscogsManager\backend\dist\index.js"
nssm set DiscogsManagerBackend AppDirectory "C:\path\to\DiscogsManager\backend"
nssm set DiscogsManagerBackend AppEnvironmentExtra "NODE_ENV=production" "HOST=127.0.0.1" "PORT=3100"
nssm set DiscogsManagerBackend Start SERVICE_AUTO_START
nssm set DiscogsManagerBackend AppExit Default Restart
nssm start DiscogsManagerBackend
```

Confirm locally before involving IIS:

```powershell
Invoke-WebRequest http://127.0.0.1:3100/api/health
```

For the initial installation, the branch also includes `scripts/deploy/configure-local-iis.ps1`. It creates the IIS site, enables ARR proxying, imports the mkcert PFX, creates the Private-network firewall rule, downloads NSSM from its official site, and registers the backend service. Run it from an elevated PowerShell after a successful build. Supply the LAN address and enter the PFX password at the prompt:

```powershell
.\scripts\deploy\configure-local-iis.ps1 -LanAddress '<your-lan-ip>' -PfxPassword (Read-Host 'PFX password' -AsSecureString)
```

## Configure IIS

1. Create `C:\inetpub\DiscogsManager`.
2. Create an IIS site named `DiscogsManager`, with that folder as its physical path.
3. Bind HTTPS on port 443 to `<your-lan-ip>` and assign the trusted certificate.
4. Open the site from this PC at `https://localhost/` and from the phone at `https://<your-lan-ip>/`. The setup script also adds an HTTP binding only to redirect users to HTTPS.

The deployment script copies built files and the supplied `web.config` to the IIS folder. The latter proxies `/api/*` to the local backend and returns `index.html` for React routes.

## Repeatable Release Flow

Run these from the project root after a change has been merged to `main`:

```powershell
git switch main
git pull
npm run build
# Start the isolated Stage services, then run:
npm run test:e2e:stage
```

Once the build and Stage tests pass, deploy with an elevated PowerShell:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\deploy\deploy-iis-site.ps1 `
  -IisContentPath 'C:\inetpub\DiscogsManager' `
  -BackendServiceName 'DiscogsManagerBackend'
```

The deploy script first creates a timestamped SQLite backup in `backend\prisma\backups`, copies the new frontend build without deleting prior files, adds IIS configuration, and restarts the backend service. The catalog database and `.env` are never copied or overwritten.

`npm run deploy:backup` uses SQLite's online backup API and verifies the snapshot with a full integrity check before publishing it. Keep the personal database URL out of dotenv. The Windows service sets production mode explicitly.

## Database Migrations

Before any release that includes new Prisma migrations, make a verified backup, stop the backend service, and explicitly scope the Prisma target to the production database:

```powershell
Stop-Service DiscogsManagerBackend
cd C:\path\to\DiscogsManager\backend
$env:DATABASE_URL = 'file:./dev.db'
try { npx prisma migrate deploy } finally { Remove-Item Env:DATABASE_URL }
Start-Service DiscogsManagerBackend
```

Do not use Stage reset scripts, Prisma `db push`, test fixtures, or exploratory writes against `backend/prisma/dev.db`.

## Recovery

If a release has a problem, stop the service, restore the most recent backup to `backend\prisma\dev.db`, restore the prior frontend build if needed, then start the service. Keep several timestamped backups before pruning old ones.
