import { jsonRequest } from '../../../api/http';

export const musicLibraryApi = {
  get: () => fetch('/api/music-library'),
  getValuationProgress: () => fetch('/api/catalog-discogs-market-stats-backfill'),
  getCollectionSync: () => fetch('/api/discogs/collection-sync'),
  setRoot: (rootPath: string) => fetch('/api/music-library', jsonRequest('PUT', { rootPath })),
  startScan: () => fetch('/api/music-library/scan', { method: 'POST' }),
  startValuation: () => fetch('/api/catalog-discogs-market-stats-backfill', { method: 'POST' }),
  startCollectionSync: () => fetch('/api/discogs/collection-sync', { method: 'POST' }),
};
