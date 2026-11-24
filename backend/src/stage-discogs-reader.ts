import axios from 'axios';
import { getDiscogsReleaseCatalogInfo, searchDiscogsReleases } from './discogs.js';

interface StageDiscogsSearch {
  query: string;
  artist: string;
  releaseTitle: string;
  catalogNumber: string;
  barcode: string;
}

export function createStageDiscogsReader(configuredToken?: string) {
  const token = configuredToken?.trim();
  if (!token || /\s/u.test(token)) {
    throw new Error('Stage live-read requires STAGE_DISCOGS_READ_TOKEN in backend/.env.stage or the current shell.');
  }
  const { get } = axios.create({ maxRedirects: 0 });

  return {
    async search({ query, artist, releaseTitle, catalogNumber, barcode }: StageDiscogsSearch) {
      const results = await searchDiscogsReleases(query, token, get, artist, releaseTitle, catalogNumber, barcode, true);
      return results.map((result) => ({ ...result, thumb: null, coverImage: null }));
    },
    catalogInfo: (releaseId: number) => getDiscogsReleaseCatalogInfo(releaseId, token, get),
  };
}

export type StageDiscogsReader = ReturnType<typeof createStageDiscogsReader>;
