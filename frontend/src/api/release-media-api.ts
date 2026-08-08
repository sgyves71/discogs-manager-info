import type { DiscogsReleaseTrack, SavedYouTubeTrackMatch, YouTubeVideoMatch } from '../types';
import type { DiscogsReleaseImage } from '../controllers/useCatalogDetailController';
import { jsonRequest, requestJson } from './http';

export const releaseMediaApi = {
  images: (discogsId: number) => requestJson<{ images?: DiscogsReleaseImage[] }>(`/api/discogs/releases/${discogsId}/images`, undefined, 'Unable to load release images.'),
  tracks: (discogsId: number) => requestJson<{ tracks?: DiscogsReleaseTrack[] }>(`/api/discogs/releases/${discogsId}/tracklist`, undefined, 'Unable to load the tracklist.'),
  youtubeCandidates: (params: URLSearchParams) => requestJson<{ videos?: YouTubeVideoMatch[] }>(`/api/youtube/best-match?${params}`, undefined, 'Unable to find YouTube matches.'),
  saveYoutubeMatch: (entryId: number, value: { trackKey: string; videoId: string; videoTitle: string; videoUrl: string }) =>
    requestJson<SavedYouTubeTrackMatch>(`/api/cds/${entryId}/youtube-track-matches`, jsonRequest('PUT', value), 'Unable to save this YouTube match.'),
};
