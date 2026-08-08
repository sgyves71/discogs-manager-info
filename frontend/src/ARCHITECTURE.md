# Frontend Architecture

The frontend uses feature-oriented React components and controller hooks.

## Composition

- `App.tsx` is the React composition root.
- `DiscogsManagerApplication.tsx` composes tabs, controllers, feature views, and the few callbacks that cross feature boundaries.

## Feature views

- `components/search` owns Search & Scan presentation.
- `components/catalog` owns Catalog, statistics, release details, tracklists, and catalog editors.
- `components/library` owns Music Library presentation.
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
Typed adapters in `api/` own HTTP request construction, response parsing, and transport errors so controllers remain focused on UI workflows.

## Data-safety invariant

Frontend development and automated mutation testing must never target `backend/prisma/dev.db`. Mutation tests use only the disposable `backend/prisma/stage.db` environment.
