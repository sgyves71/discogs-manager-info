import type { CdEntry, PersonalTrackMatch } from '../types';
import type { LocalAudioPlayerState, PersonalArtistFolder, PersonalBrowsableAlbumFolder } from '../controllers/useCatalogDetailController';
import { jsonRequest, requestJson } from './http';

type MatchLookup = { status?: 'matched' | 'notFound' | 'unindexed'; match?: PersonalTrackMatch | null };
type MatchSync = { matches?: PersonalTrackMatch[]; matchedCount?: number; unmatchedCount?: number };

export const personalMusicApi = {
  findTrack: (params: URLSearchParams) => requestJson<MatchLookup>(`/api/music-library/matches/find?${params}`, undefined, 'Unable to search the personal music library.'),
  loadMatches: (entryId: number) => requestJson<{ matches?: PersonalTrackMatch[] }>(`/api/cds/${entryId}/personal-track-matches`, undefined, 'Unable to load personal track locations.'),
  syncMatches: (entryId: number, tracks: { trackKey: string; title: string; sequenceNumber: number }[]) =>
    requestJson<MatchSync>(`/api/cds/${entryId}/personal-track-matches/sync`, jsonRequest('POST', { tracks }), 'Unable to sync personal music locations.'),
  adjacentTrack: <D extends 'next' | 'previous'>(direction: D, params: URLSearchParams) =>
    requestJson<Record<D, LocalAudioPlayerState | null>>(`/api/music-library/playback/${direction}?${params}`, undefined, `Unable to find the ${direction} local track.`),
  saveAlbumFolder: (entryId: number, folderPath: string | null) =>
    requestJson<CdEntry>(`/api/cds/${entryId}/personal-album-folder`, jsonRequest('PATCH', { folderPath }), 'Unable to save the personal album folder.'),
  artistFolders: () => requestJson<{ folders?: PersonalArtistFolder[] }>('/api/music-library/folders/artists', undefined, 'Unable to load indexed artist folders.'),
  albumFolders: (artistFolderPath: string) => requestJson<{ folders?: PersonalBrowsableAlbumFolder[] }>(`/api/music-library/folders/albums?${new URLSearchParams({ artistFolderPath })}`, undefined, 'Unable to load indexed album folders.'),
  validateAlbumFolder: (entryId: number, folderPath: string) =>
    requestJson<{ valid?: boolean }>(`/api/cds/${entryId}/personal-album-folder/validate`, jsonRequest('POST', { folderPath }), 'Unable to validate the album folder.'),
};
