export const releaseSearchApi = {
  search: (params: URLSearchParams) => fetch(`/api/discogs/search?${params}`),
  cover: (id: number) => fetch(`/api/discogs/releases/${id}/cover`),
  catalogInfo: (id: number) => fetch(`/api/discogs/releases/${id}/catalog-info`),
};
