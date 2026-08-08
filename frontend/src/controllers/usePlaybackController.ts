import type { Dispatch, SetStateAction } from 'react';
import type { CatalogDetailController } from './useCatalogDetailController';
import type { CdEntry, DiscogsReleaseTrack, PersonalTrackMatch } from '../types';
import { trackKey } from '../utils/catalog';
import { personalMusicApi } from '../api/personal-music-api';
import { useReleaseMediaController } from './useReleaseMediaController';

type Dependencies = { setItems: Dispatch<SetStateAction<CdEntry[]>>; setCollectionStatus: (value: string) => void };

export function usePlaybackController(detail: CatalogDetailController, dependencies: Dependencies) {
  const { setItems, setCollectionStatus } = dependencies;
  const {
    viewedEntry, setViewedEntry, detailTracks, setYouTubePlayer, setPersonalTrackMatches, setPersonalMusicStatus,
    localAudioPlayer, setLocalAudioPlayer, personalLocationSyncing, setPersonalLocationSyncing, setPersonalAlbumMappingStatus,
    setAlbumPlaybackNotFound,
    personalTrackNotFoundPrompt, setPersonalTrackNotFoundPrompt, setShowPersonalFolderMapping,
    setSelectedPersonalArtistFolderPath, setSelectedPersonalAlbumFolderPath, setPersonalAlbumValidation,
    setPersonalArtistFolders, setPersonalBrowsableAlbumFolders,
  } = detail;
  const releaseMedia = useReleaseMediaController(detail, setCollectionStatus);
  const { loadReleaseTracks } = releaseMedia;

  async function findPersonalCopy(track: DiscogsReleaseTrack) {
    if (!viewedEntry) return;
    setPersonalMusicStatus(`Looking for “${track.title}” in your personal music library...`);
    try {
      const playableTracks = detailTracks.filter((candidate) => !candidate.isComposite);
      const sequenceNumber = playableTracks.findIndex((candidate) => trackKey(candidate) === trackKey(track)) + 1;
      const params = new URLSearchParams({ cdEntryId: String(viewedEntry.id), trackKey: trackKey(track), trackTitle: track.title });
      if (sequenceNumber > 0) params.set('sequenceNumber', String(sequenceNumber));
      const data = await personalMusicApi.findTrack(params);
      if (data.status === 'matched' && data.match) {
        setShowPersonalFolderMapping(false);
        setPersonalTrackMatches((current) => [...current.filter((match) => match.trackKey !== data.match!.trackKey), data.match!]);
        playLocalCopy(data.match);
        setPersonalMusicStatus(`Found your local copy of “${track.title}”.`);
      } else if (data.status === 'unindexed') {
        setPersonalMusicStatus('Your music library has not been scanned yet. Open Music Library in the left navigation and choose Scan library.');
      } else {
        setPersonalMusicStatus(`No tagged local copy of “${track.title}” was found.`);
        setPersonalTrackNotFoundPrompt(track);
      }
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to search the personal music library.');
    }
  }

  function playLocalCopy(match: PersonalTrackMatch) {
    if (!viewedEntry) return;
    setYouTubePlayer(null);
    setLocalAudioPlayer({ trackId: match.libraryTrack.id, catalogEntryId: viewedEntry.id, title: match.libraryTrack.title, subtitle: `${match.libraryTrack.artist} — ${match.libraryTrack.album}` });
  }

  async function requestPersonalLocationSync(tracks: DiscogsReleaseTrack[]) {
    if (!viewedEntry) throw new Error('Choose a catalog entry before syncing personal locations.');
    const playableTracks = tracks.filter((track) => !track.isComposite);
    if (!playableTracks.length) throw new Error('This release does not have a playable tracklist.');
    const data = await personalMusicApi.syncMatches(viewedEntry.id, playableTracks.map((track, index) => ({ trackKey: trackKey(track), title: track.title, sequenceNumber: index + 1 })));
    return { ...data, playableTrackCount: playableTracks.length };
  }

  async function playAlbum() {
    if (!viewedEntry) return;
    setAlbumPlaybackNotFound(false);
    setPersonalMusicStatus('Finding the first available local track...');
    try {
      const data = await personalMusicApi.loadMatches(viewedEntry.id);
      let matches = data.matches ?? [];
      if (!matches.length) {
        setPersonalLocationSyncing(true);
        setPersonalMusicStatus('Syncing this album with the playback collection...');
        const sync = await requestPersonalLocationSync(await loadReleaseTracks());
        matches = sync.matches ?? [];
      }
      setPersonalTrackMatches(matches);
      const firstMatch = [...matches].sort((left, right) =>
        (left.libraryTrack.discNumber ?? 1) - (right.libraryTrack.discNumber ?? 1)
        || (left.libraryTrack.trackNumber ?? Number.MAX_SAFE_INTEGER) - (right.libraryTrack.trackNumber ?? Number.MAX_SAFE_INTEGER)
        || left.libraryTrack.id - right.libraryTrack.id)[0];
      if (firstMatch) {
        playLocalCopy(firstMatch);
        setPersonalMusicStatus(`Playing “${firstMatch.libraryTrack.title}” from the beginning of the album.`);
        return;
      }
      setPersonalMusicStatus('Album not found in playback collection.');
      setAlbumPlaybackNotFound(true);
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to start album playback.');
      setAlbumPlaybackNotFound(true);
    } finally {
      setPersonalLocationSyncing(false);
    }
  }

  async function playNextLocalCopy() {
    const currentPlayer = localAudioPlayer;
    if (!currentPlayer) return;
    try {
      const query = new URLSearchParams({ cdEntryId: String(currentPlayer.catalogEntryId), trackId: String(currentPlayer.trackId) });
      const data = await personalMusicApi.adjacentTrack('next', query);
      if (data.next) {
        setLocalAudioPlayer(data.next);
        return;
      }
      setPersonalMusicStatus('Reached the end of the available personal music playback queue.');
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to find the next local track.');
    }
  }

  async function playPreviousLocalCopy() {
    const currentPlayer = localAudioPlayer;
    if (!currentPlayer) return;
    try {
      const query = new URLSearchParams({ cdEntryId: String(currentPlayer.catalogEntryId), trackId: String(currentPlayer.trackId) });
      const data = await personalMusicApi.adjacentTrack('previous', query);
      if (data.previous) {
        setLocalAudioPlayer(data.previous);
        return;
      }
      setPersonalMusicStatus('Reached the beginning of the available personal music playback queue.');
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to find the previous local track.');
    }
  }

  async function syncPersonalTrackLocations() {
    if (!viewedEntry || !detailTracks.length || personalLocationSyncing) return;
    const playableTracks = detailTracks.filter((track) => !track.isComposite);
    if (!playableTracks.length) return;
    setPersonalLocationSyncing(true);
    setPersonalMusicStatus(`Syncing personal locations for ${playableTracks.length} tracks...`);
    try {
      const data = await requestPersonalLocationSync(detailTracks);
      setPersonalTrackMatches(data.matches ?? []);
      setPersonalMusicStatus(`${data.matchedCount ?? 0} of ${playableTracks.length} personal track locations synced${data.unmatchedCount ? `; ${data.unmatchedCount} not found.` : '.'}`);
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to sync personal music locations.');
    } finally {
      setPersonalLocationSyncing(false);
    }
  }

  async function savePersonalAlbumFolder(folderPath: string | null) {
    if (!viewedEntry) return;
    setPersonalAlbumMappingStatus(folderPath ? 'Saving personal album folder...' : 'Clearing personal album folder...');
    try {
      const updated = await personalMusicApi.saveAlbumFolder(viewedEntry.id, folderPath);
      setViewedEntry(updated);
      setItems((current) => current.map((item) => item.id === updated.id ? { ...item, personalAlbumFolderPath: updated.personalAlbumFolderPath, personalAlbumFolderMappedAt: updated.personalAlbumFolderMappedAt } : item));
      if (updated.personalAlbumFolderPath) {
        setPersonalMusicStatus('Personal album folder saved. Try the track again.');
        setPersonalArtistFolders(null);
        setPersonalBrowsableAlbumFolders(null);
        setShowPersonalFolderMapping(false);
      } else {
        setPersonalAlbumMappingStatus('Personal album folder mapping cleared.');
      }
    } catch (error) {
      setPersonalAlbumMappingStatus(error instanceof Error ? error.message : 'Unable to save the personal album folder.');
    }
  }

  function beginManualPersonalAlbumMatch() {
    if (!personalTrackNotFoundPrompt) return;
    setPersonalTrackNotFoundPrompt(null);
    setShowPersonalFolderMapping(true);
    setSelectedPersonalArtistFolderPath('');
    setSelectedPersonalAlbumFolderPath('');
    setPersonalAlbumValidation('idle');
    void browsePersonalArtistFolders();
  }

  async function browsePersonalArtistFolders() {
    setPersonalAlbumMappingStatus('Loading indexed artist folders...');
    setPersonalBrowsableAlbumFolders(null);
    try {
      const data = await personalMusicApi.artistFolders();
      setPersonalArtistFolders(data.folders ?? []);
      setPersonalAlbumMappingStatus('Choose the base artist folder, then choose the album folder.');
    } catch (error) {
      setPersonalAlbumMappingStatus(error instanceof Error ? error.message : 'Unable to load indexed artist folders.');
    }
  }

  async function browsePersonalAlbumFolders(artistFolderPath: string) {
    setPersonalAlbumMappingStatus('Loading indexed album folders...');
    setSelectedPersonalArtistFolderPath(artistFolderPath);
    setSelectedPersonalAlbumFolderPath('');
    setPersonalAlbumValidation('idle');
    try {
      const data = await personalMusicApi.albumFolders(artistFolderPath);
      setPersonalBrowsableAlbumFolders(data.folders ?? []);
      setPersonalAlbumMappingStatus('Choose the album folder that contains this release.');
    } catch (error) {
      setPersonalAlbumMappingStatus(error instanceof Error ? error.message : 'Unable to load indexed album folders.');
    }
  }

  async function validatePersonalAlbumFolder(folderPath: string) {
    if (!viewedEntry || !folderPath) return;
    setSelectedPersonalAlbumFolderPath(folderPath);
    setPersonalAlbumValidation('checking');
    setPersonalAlbumMappingStatus('Checking every indexed track against the Discogs release...');
    try {
      const data = await personalMusicApi.validateAlbumFolder(viewedEntry.id, folderPath);
      if (data.valid) {
        setPersonalAlbumValidation('valid');
        setPersonalAlbumMappingStatus('All tracks matched one-to-one. You can save this folder.');
      } else {
        setPersonalAlbumValidation('invalid');
        setPersonalAlbumMappingStatus('Cannot make one-to-one track associations for this folder.');
      }
    } catch (error) {
      setPersonalAlbumValidation('invalid');
      setPersonalAlbumMappingStatus(error instanceof Error ? error.message : 'Unable to validate the album folder.');
    }
  }


  return {
    ...releaseMedia, findPersonalCopy, playLocalCopy, playAlbum, playNextLocalCopy,
    playPreviousLocalCopy, syncPersonalTrackLocations,
    savePersonalAlbumFolder, beginManualPersonalAlbumMatch, browsePersonalArtistFolders,
    browsePersonalAlbumFolders, validatePersonalAlbumFolder,
  };
}
