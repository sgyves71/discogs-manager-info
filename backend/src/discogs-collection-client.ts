import { addDiscogsReleaseToCollection, getDiscogsCollectionReleases, getDiscogsUsername } from './discogs.js';
import type { DiscogsCollectionClient } from './services/discogs-collection-sync-service.js';

export function createDiscogsCollectionClient(token: string): DiscogsCollectionClient {
  return {
    getUsername: () => getDiscogsUsername(token),
    getReleases: (username) => getDiscogsCollectionReleases(username, token),
    addRelease: (username, releaseId) => addDiscogsReleaseToCollection(username, releaseId, token),
  };
}

export function createStageDiscogsCollectionClient(): DiscogsCollectionClient {
  const timeoutReleaseId = 900199;
  const collection = new Set<number>();
  let timedOut = false;

  return {
    getUsername: async () => 'stage-discogs-user',
    getReleases: async () => [...collection].map((releaseId) => ({ releaseId, instanceId: releaseId })),
    addRelease: async (_username, releaseId) => {
      if (releaseId === timeoutReleaseId && !timedOut) {
        timedOut = true;
        throw new DOMException('Synthetic Discogs add timed out before writing.', 'TimeoutError');
      }
      if (collection.has(releaseId)) throw new Error('Synthetic release already exists in the collection.');
      collection.add(releaseId);
      return releaseId;
    },
  };
}
