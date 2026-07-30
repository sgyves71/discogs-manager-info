import type { DiscogsReleaseCatalogInfo, DiscogsReleaseContext, DiscogsReleaseImage, DiscogsReleaseTrack, NormalizedDiscogsResult } from './discogs.js';

export const STAGE_DISCOGS_RELEASE_ID = 900101;
const coverImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"%3E%3Crect width="300" height="300" fill="%231f2933"/%3E%3Ccircle cx="150" cy="150" r="92" fill="%235aa6d1"/%3E%3Ccircle cx="150" cy="150" r="28" fill="%231f2933"/%3E%3Ctext x="150" y="268" fill="white" font-family="Arial" font-size="22" text-anchor="middle"%3EStage Mock%3C/text%3E%3C/svg%3E';

const primaryResult: NormalizedDiscogsResult = {
  id: STAGE_DISCOGS_RELEASE_ID,
  artist: 'Stage Mock Artist',
  title: 'Mocked CD Album',
  year: 1988,
  country: 'US',
  label: 'Search Result Label',
  format: 'CD, Album',
  uri: `/release/${STAGE_DISCOGS_RELEASE_ID}`,
  thumb: coverImage,
  coverImage,
  catalogNumber: 'SEARCH-PLACEHOLDER',
  barcode: null,
  lowestPrice: 12.5,
};

const alternateResult: NormalizedDiscogsResult = {
  ...primaryResult,
  id: 900102,
  title: 'Mocked CD Album (Reissue)',
  year: 1998,
  country: 'UK',
  catalogNumber: 'MOCK-CD-002',
};

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function searchStageDiscogsReleases(criteria: { query: string; artist: string; title: string; catalogNumber: string; barcode: string }): NormalizedDiscogsResult[] {
  const values = [criteria.query, criteria.artist, criteria.title, criteria.catalogNumber, criteria.barcode].map(normalized).filter(Boolean);
  if (!values.length) return [];
  const knownSearch = values.some((value) => ['stage mock', 'mocked cd', 'mock-cd-001', '0123456789012'].some((term) => value.includes(term)));
  return knownSearch ? [primaryResult, alternateResult] : [];
}

export function getStageDiscogsCatalogInfo(releaseId: number): DiscogsReleaseCatalogInfo | null {
  if (releaseId !== STAGE_DISCOGS_RELEASE_ID) return null;
  return { label: 'Mock Records', catalogNumber: 'MOCK-CD-001', barcode: 'Text: 0 123456 789012 · Scanned: 0123456789012' };
}

export function getStageDiscogsContext(releaseId: number): DiscogsReleaseContext | null {
  if (releaseId !== STAGE_DISCOGS_RELEASE_ID) return null;
  return {
    artistProfile: 'Stage Mock Artist is a synthetic artist used only for repeatable automated testing.',
    description: 'This synthetic CD release supplies stable label, barcode, tracklist, and context data for Stage tests.',
    descriptionSource: 'release',
    genre: 'Rock',
    style: 'Hard Rock',
  };
}

export function getStageDiscogsCover(releaseId: number): string | null {
  return releaseId === STAGE_DISCOGS_RELEASE_ID || releaseId === 900102 ? coverImage : null;
}

export function getStageDiscogsImages(releaseId: number): DiscogsReleaseImage[] | null {
  const cover = getStageDiscogsCover(releaseId);
  return cover ? [{ url: cover, thumbnailUrl: cover }] : null;
}

export function getStageDiscogsTracklist(releaseId: number): DiscogsReleaseTrack[] | null {
  if (releaseId !== STAGE_DISCOGS_RELEASE_ID) return null;
  return [
    { position: '1', title: 'Stage Song One', duration: '3:21' },
    { position: '2', title: 'Stage Song Two', duration: '4:05' },
  ];
}
