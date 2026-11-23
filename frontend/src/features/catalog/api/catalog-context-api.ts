export const catalogContextApi = {
  discogs: (id: number, entryId?: number) =>
    fetch(`/api/discogs/releases/${id}/context${entryId === undefined ? '' : `?cdEntryId=${entryId}`}`),
  cover: (id: number) => fetch(`/api/discogs/releases/${id}/cover`),
  musicBrainz: (artist: string, album: string) =>
    fetch(`/api/musicbrainz/context?${new URLSearchParams({ artist, album })}`),
  ebay: (params: URLSearchParams) => fetch(`/api/ebay/active-listing-stats?${params}`),
  youtubeMatches: (id: number) => fetch(`/api/cds/${id}/youtube-track-matches`),
  personalMatches: (id: number) => fetch(`/api/cds/${id}/personal-track-matches`),
  marketStats: (id: number) => fetch(`/api/discogs/releases/${id}/market-stats`),
};
