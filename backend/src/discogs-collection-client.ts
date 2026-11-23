import { addDiscogsReleaseToCollection, getDiscogsCollectionReleases, getDiscogsUsername } from './discogs.js';
import type { DiscogsCollectionClient } from './services/discogs-collection-sync-service.js';

export function createDiscogsCollectionClient(token: string): DiscogsCollectionClient {
  return {
    getUsername: () => getDiscogsUsername(token),
    getReleases: (username) => getDiscogsCollectionReleases(username, token),
    addRelease: (username, releaseId) => addDiscogsReleaseToCollection(username, releaseId, token),
  };
}

export const stageDiscogsCollectionClient: DiscogsCollectionClient = {
  getUsername: async () => 'stage-discogs-user',
  getReleases: async () => [],
  addRelease: async (_username, releaseId) => releaseId,
};
