# DiscogsManager architecture

## Where to start in the code

| Area | Entry point |
| --- | --- |
| Frontend composition | [DiscogsManagerApplication.tsx](../frontend/src/DiscogsManagerApplication.tsx) wires the feature screens and their controllers. |
| Search, catalog, and library | [Frontend architecture](../frontend/src/ARCHITECTURE.md) maps the feature folders and their components, controllers, and API calls. |
| Backend startup and wiring | [backend/src/index.ts](../backend/src/index.ts) loads and validates configuration, constructs dependencies, mounts routers, and starts Express. |
| Catalog requests | [catalog-router.ts](../backend/src/routes/catalog-router.ts) owns listing, cover retrieval, adding, editing, and removing catalog entries. |
| Library and integration requests | [Music Library router](../backend/src/routes/music-library-router.ts), [release integrations router](../backend/src/routes/release-integrations-router.ts), and [Discogs sync router](../backend/src/routes/discogs-sync-router.ts) own those HTTP entry points. |
| Tests | Backend unit tests mirror source areas under `backend/tests/`. Playwright lives under `e2e/tests/` and Stage guard tests under `scripts/tests/`. |

`npm run test:unit` checks and runs the backend test sources without building `backend/dist`. The deployment entry point remains `backend/dist/index.js`. Use a clean build directory for release artifacts so older output cannot be mistaken for current files.

The startup code supplies either the live or synthetic Discogs collection client to the sync service. Both clients use the same sync workflow and database status handling. The synthetic client returns a fixture username and synthetic collection instance IDs.

## Design conventions

- **Single responsibility.** Routers parse requests and translate outcomes into HTTP responses. Services own workflows and their state. `MusicLibraryScanService` owns indexing, catalog matching, and progress. It reserves one scan slot before asynchronous validation and releases it after validation fails or the job finishes. Matching scores remain in plain functions.
- **Open/closed and substitution.** Use a shared contract when behavior needs an alternate implementation. A synthetic Discogs client follows the same contract as the live client so both can drive the same sync service.
- **Interface segregation.** Give a consumer only the operations it needs. The scan service takes a narrow subset of the Prisma client.
- **Dependency inversion.** Pass services their collaborators explicitly. Introduce an application-owned contract where it enables a real substitution, as with Discogs sync. Keep direct Prisma queries where the persistence behavior is straightforward.

`PersonalTrackMatchService` owns release track sync, single-track and album lookup, and album folder assignment and validation. Track sync and single-track lookup share candidate selection and scoring. The routes parse requests and translate outcomes into HTTP responses.

Prefer classes for workflows that own state and coordinate dependencies. Prefer plain functions for transformations and scoring. When moving behavior, preserve the HTTP and persistence contracts and verify them through the existing entry points.

## Production and Stage topology

```mermaid
flowchart LR
    subgraph Production
        PBrowser["Browser on home network"] -->|HTTPS| IIS["IIS serves the React build"]
        IIS -->|"/api proxy · port 3100"| PAPI["Express · Windows service"]
        PAPI --> PPrisma["Prisma"]
        PPrisma --> PDB[("Personal SQLite · dev.db")]
        PAPI --> External["Discogs, MusicBrainz, eBay, YouTube"]
        PAPI --> Media["Personal music library"]
        PDB -->|SQLite online backup| Snapshot[("Verified local snapshot")]
    end

    subgraph Stage["Stage and local development"]
        Tester["Reviewer or Playwright"] -->|Loopback 5174| Vite["Vite serves the React app"]
        Vite -->|"/api proxy · loopback 3101"| SAPI["Express · Stage mode"]
        Tester -.->|Direct API checks| SAPI
        SAPI --> SPrisma["Prisma"]
        SPrisma --> SDB[("Synthetic SQLite · stage.db")]
        SAPI --> Fixtures["Discogs and MusicBrainz fixtures"]
        SAPI --> Library["Synthetic library index"]
    end
```

The same React and Express code serves both environments. Stage skips live Discogs account writes and clears Discogs, eBay, and YouTube credentials. The verified production snapshot is local to the same drive. The explicit production startup guard went live in the November 18, 2026 release. See the [IIS runbook](local-iis-deployment.md) and [Stage runbook](../e2e/README.md).

## Stage checks before tests run

```mermaid
flowchart TD
    Reset["Reset and seed while Stage is stopped"] --> Path["Check canonical Stage DB path and sidecars"]
    Path --> Seed["Apply schema and seed synthetic records"]
    Launch["Launch Stage backend"] --> Env["Load dotenv and validate effective mode, DB, host and port"]
    Env --> Alias["Validate Stage database path and sidecars"]
    Alias --> Prisma["Construct Prisma with the resolved Stage path"]
    Seed --> Identity["Stage identity reports seeded fixture and runtime instance"]
    Prisma --> Identity
    Identity --> Direct["Probe direct API"]
    Identity --> Proxy["Probe through the Vite proxy"]
    Direct --> Compare{"Expected fixture and same runtime instance?"}
    Proxy --> Compare
    Compare -->|Yes| Run["Run Playwright"]
    Compare -->|No| Abort["Abort before tests"]
```

An unsafe database path or effective configuration stops startup before Prisma construction. Reset and seed check the path before opening or deleting SQLite files. Playwright uses the fixture and runtime identity together to check that the browser and API tests reach the same Stage application.

## Demo 1 request and data flow

```mermaid
sequenceDiagram
    actor Reviewer
    participant UI as React in browser
    participant API as Express Stage API
    participant Fixture as Discogs fixture
    participant DB as Stage SQLite via Prisma

    Reviewer->>UI: Look up and select release 900101
    UI->>API: Search and request release details
    API->>Fixture: Resolve release and catalog metadata
    Fixture-->>API: Original CD and catalog number
    API-->>UI: Display selectable result

    Reviewer->>UI: Edit & Add, then Add to Catalog
    UI->>API: POST /api/cds
    API->>DB: Find existing row by Discogs release ID
    DB-->>API: No existing row
    API->>DB: Insert catalog entry
    API-->>UI: 201 Created

    Reviewer->>UI: Edit title and notes in Catalog Details
    UI->>API: PATCH /api/cds/id/details
    API->>DB: Update the same local entry
    API-->>UI: 200 with edited details

    Reviewer->>UI: Add the original release again
    UI->>API: POST /api/cds with release 900101
    API->>DB: Find existing row by Discogs release ID
    DB-->>API: Return the edited row
    API-->>UI: 409 Conflict with duplicate message
    UI-->>Reviewer: Show the error and OK button

    Note over API,DB: The test reads the catalog again and checks for one edited row.
```

The Discogs release ID identifies the pressing. The local entry ID identifies the row being edited. The demonstrated duplicate check is sequential. The schema currently has no unique constraint on Discogs release ID. See the [Demo 1 verification record](demo-one.md).
