# Frontend Architecture

The frontend uses feature-oriented React components and controller hooks.

## Composition

- `App.tsx` is the React composition root.
- `DiscogsManagerApplication.tsx` composes tabs, controllers, feature views, and the few callbacks that cross feature boundaries.

## Feature views

- `features/search` owns Search & Scan.
- `features/catalog` owns Catalog, statistics, release details, tracklists, and catalog editors.
- `features/library` owns Music Library and playback workflows.
- Each feature keeps its views in `components/`, workflow hooks in `controllers/`, and HTTP calls in `api/`.
- `components/shared` contains presentation primitives used by more than one feature.

Views receive typed state and actions. They do not perform API requests.

## Controllers

- `useDiscogsSearchController` owns Discogs query state, result pagination, cover loading, search commands, release enrichment, and search caches.
- `useCatalogController` owns catalog pagination, filters, style options, and statistics loading.
- `useCatalogDetailController` owns catalog-detail and playback view state.
- `useCatalogContextController` loads Discogs, MusicBrainz, eBay, market, YouTube-match, and personal-match context.
- `useCatalogEditorController` owns catalog add, correction, removal, and edit commands.
- `useReleaseMediaController` owns Discogs images and tracklists plus YouTube discovery and selection.
- `usePlaybackController` composes release media with local playback and personal-folder workflows.
- `useMusicLibraryController` owns library configuration, scanning, polling, valuation updates, and Discogs collection synchronization.
- `useBarcodeScanner` and `useCatalogNumberVoice` isolate browser-device lifecycles.

Shared domain contracts live in `types.ts`; pure catalog formatting and normalization functions live in `utils/catalog.ts`.
Feature API modules own endpoint paths and request construction. They return typed data where the HTTP response can be handled uniformly. Some workflows still inspect the response to preserve their status-specific messages and fallbacks. The generic JSON transport helper lives in `api/http.ts`.

## Data-safety invariant

Frontend development and automated mutation testing must never target `backend/prisma/dev.db`. Mutation tests use only the disposable `backend/prisma/stage.db` environment.
