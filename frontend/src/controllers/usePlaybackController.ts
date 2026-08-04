import type { Dispatch, SetStateAction } from 'react';
import type { CatalogDetailController, DiscogsReleaseImage, LocalAudioPlayerState, PersonalArtistFolder, PersonalBrowsableAlbumFolder } from './useCatalogDetailController';
import type { CdEntry, DiscogsReleaseTrack, PersonalTrackMatch, SavedYouTubeTrackMatch, YouTubeVideoMatch } from '../types';
import { cleanExternalSearchText, trackDurationSeconds, trackKey } from '../utils/catalog';

type Dependencies = { setItems: Dispatch<SetStateAction<CdEntry[]>>; setCollectionStatus: (value: string) => void; setMusicLibraryStatus: (value: string) => void };

export function usePlaybackController(detail: CatalogDetailController, dependencies: Dependencies) {
  const { setItems, setCollectionStatus, setMusicLibraryStatus } = dependencies;
  const {
    viewedEntry, setViewedEntry, showDetailImages, setShowDetailImages, detailImages, setDetailImages, setDetailImagesStatus,
    detailTracks, setDetailTracks, setDetailTracksStatus, setShowTracklist, setYouTubeStatus, setYouTubeCandidates,
    setSavedYouTubeMatches, setYouTubePlayer, setPersonalTrackMatches, setPersonalMusicStatus,
    localAudioPlayer, setLocalAudioPlayer, personalLocationSyncing, setPersonalLocationSyncing, setPersonalAlbumMappingStatus,
    personalTrackNotFoundPrompt, setPersonalTrackNotFoundPrompt, setShowPersonalFolderMapping,
    setSelectedPersonalArtistFolderPath, setSelectedPersonalAlbumFolderPath, setPersonalAlbumValidation,
    setPersonalArtistFolders, setPersonalBrowsableAlbumFolders,
  } = detail;

  async function loadDetailImages() {
    if (!viewedEntry?.discogsId) {
      setDetailImagesStatus('This catalog entry does not have a Discogs release to load images from.');
      return;
    }
    if (showDetailImages) {
      setShowDetailImages(false);
      return;
    }
    setShowDetailImages(true);
    if (detailImages.length) return;
    setDetailImagesStatus('Loading Discogs release images...');
    try {
      const response = await fetch(`/api/discogs/releases/${viewedEntry.discogsId}/images`);
      const data = await response.json() as { images?: DiscogsReleaseImage[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load release images.');
      setDetailImages(data.images ?? []);
      setDetailImagesStatus(data.images?.length ? '' : 'Discogs does not provide additional images for this release.');
    } catch (error) {
      setDetailImagesStatus(error instanceof Error ? error.message : 'Unable to load release images.');
    }
  }

  function openDiscogsRelease(item: CdEntry) {
    const url = item.discogsUri
      ? `https://www.discogs.com${item.discogsUri}`
      : item.discogsId ? `https://www.discogs.com/release/${item.discogsId}` : null;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openDiscogsMarketplace(item: CdEntry) {
    if (!item.discogsId) {
      setCollectionStatus('This catalog entry does not have a Discogs release to search.');
      return;
    }
    window.open(`https://www.discogs.com/sell/release/${item.discogsId}`, '_blank', 'noopener,noreferrer');
  }

  async function openTracklist() {
    if (!viewedEntry?.discogsId) {
      setDetailTracksStatus('This catalog entry does not have a Discogs release to load a tracklist from.');
      return;
    }
    setShowTracklist(true);
    if (detailTracks.length) return;
    setDetailTracksStatus('Loading Discogs tracklist...');
    try {
      const response = await fetch(`/api/discogs/releases/${viewedEntry.discogsId}/tracklist`);
      const data = await response.json() as { tracks?: DiscogsReleaseTrack[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load the tracklist.');
      setDetailTracks(data.tracks ?? []);
      setDetailTracksStatus(data.tracks?.length ? '' : 'Discogs does not provide a tracklist for this release.');
    } catch (error) {
      setDetailTracksStatus(error instanceof Error ? error.message : 'Unable to load the tracklist.');
    }
  }

  function openTrackOnYouTube(track: DiscogsReleaseTrack) {
    if (!viewedEntry) return;
    const query = [cleanExternalSearchText(viewedEntry.artist), cleanExternalSearchText(viewedEntry.title), cleanExternalSearchText(track.title)].filter(Boolean).join(' ');
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
  }

  async function findYouTubeMatches(track: DiscogsReleaseTrack) {
    if (!viewedEntry) return;
    setYouTubeCandidates(null);
    setYouTubeStatus(`Finding YouTube matches for “${track.title}”...`);
    try {
      const params = new URLSearchParams({
        artist: cleanExternalSearchText(viewedEntry.artist),
        album: cleanExternalSearchText(viewedEntry.title),
        track: cleanExternalSearchText(track.title),
      });
      const duration = trackDurationSeconds(track.duration);
      if (duration) params.set('durationSeconds', String(duration));
      const response = await fetch(`/api/youtube/best-match?${params.toString()}`);
      const data = await response.json() as { videos?: YouTubeVideoMatch[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to find YouTube matches.');
      if (!data.videos?.length) {
        setYouTubeStatus('No good YouTube candidates were returned for this track. Use Search instead.');
        return;
      }
      setYouTubeCandidates({ track, videos: data.videos });
      setYouTubeStatus('Choose the correct match. Your selection will be remembered for this track.');
    } catch (error) {
      setYouTubeStatus(error instanceof Error ? error.message : 'Unable to find a YouTube match.');
    }
  }

  async function chooseYouTubeMatch(track: DiscogsReleaseTrack, video: YouTubeVideoMatch) {
    if (!viewedEntry) return;
    try {
      const response = await fetch(`/api/cds/${viewedEntry.id}/youtube-track-matches`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackKey: trackKey(track), videoId: video.videoId, videoTitle: video.title, videoUrl: video.watchUrl }),
      });
      const saved = await response.json() as SavedYouTubeTrackMatch & { error?: string };
      if (!response.ok) throw new Error(saved.error || 'Unable to save this YouTube match.');
      setSavedYouTubeMatches((current) => [...current.filter((match) => match.trackKey !== saved.trackKey), saved]);
      setYouTubeCandidates(null);
      setYouTubeStatus(`Saved match: ${video.title}`);
      setLocalAudioPlayer(null);
      setYouTubePlayer({ videoId: video.videoId, title: video.title, watchUrl: video.watchUrl });
    } catch (error) {
      setYouTubeStatus(error instanceof Error ? error.message : 'Unable to save this YouTube match.');
    }
  }

  async function findPersonalCopy(track: DiscogsReleaseTrack) {
    if (!viewedEntry) return;
    setPersonalMusicStatus(`Looking for “${track.title}” in your personal music library...`);
    try {
      const playableTracks = detailTracks.filter((candidate) => !candidate.isComposite);
      const sequenceNumber = playableTracks.findIndex((candidate) => trackKey(candidate) === trackKey(track)) + 1;
      const params = new URLSearchParams({ cdEntryId: String(viewedEntry.id), trackKey: trackKey(track), trackTitle: track.title });
      if (sequenceNumber > 0) params.set('sequenceNumber', String(sequenceNumber));
      const response = await fetch(`/api/music-library/matches/find?${params.toString()}`);
      const data = await response.json() as { status?: 'matched' | 'notFound' | 'unindexed'; match?: PersonalTrackMatch | null; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to search the personal music library.');
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

  async function playNextLocalCopy() {
    const currentPlayer = localAudioPlayer;
    if (!currentPlayer) return;
    try {
      const query = new URLSearchParams({ cdEntryId: String(currentPlayer.catalogEntryId), trackId: String(currentPlayer.trackId) });
      const response = await fetch(`/api/music-library/playback/next?${query.toString()}`);
      const data = await response.json() as { next?: LocalAudioPlayerState | null; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to find the next local track.');
      if (data.next) {
        setLocalAudioPlayer(data.next);
        return;
      }
      setPersonalMusicStatus('Reached the end of the available personal music playback queue.');
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to find the next local track.');
    }
  }

  async function scanCatalogPersonalLocations() {
    setMusicLibraryStatus('Starting catalog local-copy matching...');
    try {
      const response = await fetch('/api/music-library/catalog-personal-locations/scan', { method: 'POST' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to start catalog local-copy matching.');
      setMusicLibraryStatus('Matching catalog albums against your indexed local music. You can leave this page while it runs.');
    } catch (error) {
      setMusicLibraryStatus(error instanceof Error ? error.message : 'Unable to start catalog local-copy matching.');
    }
  }

  async function playPreviousLocalCopy() {
    const currentPlayer = localAudioPlayer;
    if (!currentPlayer) return;
    try {
      const query = new URLSearchParams({ cdEntryId: String(currentPlayer.catalogEntryId), trackId: String(currentPlayer.trackId) });
      const response = await fetch(`/api/music-library/playback/previous?${query.toString()}`);
      const data = await response.json() as { previous?: LocalAudioPlayerState | null; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to find the previous local track.');
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
      const response = await fetch(`/api/cds/${viewedEntry.id}/personal-track-matches/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: playableTracks.map((track, index) => ({ trackKey: trackKey(track), title: track.title, sequenceNumber: index + 1 })) }),
      });
      const responseText = await response.text();
      let data: { matches?: PersonalTrackMatch[]; matchedCount?: number; unmatchedCount?: number; error?: string } = {};
      try { data = responseText ? JSON.parse(responseText) as typeof data : {}; } catch { /* malformed responses are handled below */ }
      if (!response.ok) throw new Error(data.error || 'Unable to sync personal music locations.');
      setPersonalTrackMatches(data.matches ?? []);
      setPersonalMusicStatus(`${data.matchedCount ?? 0} of ${playableTracks.length} personal track locations synced${data.unmatchedCount ? `; ${data.unmatchedCount} not found.` : '.'}`);
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to sync personal music locations.');
    } finally {
      setPersonalLocationSyncing(false);
    }
  }

  /* async function findPersonalAlbumFolder() {
    if (!viewedEntry) return;
    setPersonalMusicStatus(`Looking for the local album folder for “${viewedEntry.title}”...`);
    setPersonalAlbumFolders(null);
    try {
      const response = await fetch(`/api/music-library/albums/find?cdEntryId=${viewedEntry.id}`);
      const data = await response.json() as { status?: 'found' | 'notFound' | 'unindexed'; albums?: PersonalAlbumFolder[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to search the personal music library.');
      if (data.status === 'found' && data.albums?.length) {
        setPersonalAlbumFolders(data.albums);
        setPersonalMusicStatus(`Found ${data.albums.length} matching local album ${data.albums.length === 1 ? 'folder' : 'folders'}.`);
      } else if (data.status === 'unindexed') {
        setPersonalMusicStatus('Your music library has not been scanned yet. Open Music Library and choose Scan library.');
      } else {
        setPersonalMusicStatus('No matching local album folder was found. Try scanning or rescanning the music library.');
      }
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to search the personal music library.');
    }
  } */

  async function savePersonalAlbumFolder(folderPath: string | null) {
    if (!viewedEntry) return;
    setPersonalAlbumMappingStatus(folderPath ? 'Saving personal album folder...' : 'Clearing personal album folder...');
    try {
      const response = await fetch(`/api/cds/${viewedEntry.id}/personal-album-folder`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath }),
      });
      const updated = await response.json() as CdEntry & { error?: string };
      if (!response.ok) throw new Error(updated.error || 'Unable to save the personal album folder.');
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
      const response = await fetch('/api/music-library/folders/artists');
      const data = await response.json() as { folders?: PersonalArtistFolder[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load indexed artist folders.');
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
      const response = await fetch(`/api/music-library/folders/albums?${new URLSearchParams({ artistFolderPath })}`);
      const data = await response.json() as { folders?: PersonalBrowsableAlbumFolder[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load indexed album folders.');
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
      const response = await fetch(`/api/cds/${viewedEntry.id}/personal-album-folder/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath }) });
      const data = await response.json() as { valid?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to validate the album folder.');
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
    loadDetailImages, openDiscogsRelease, openDiscogsMarketplace, openTracklist, openTrackOnYouTube,
    findYouTubeMatches, chooseYouTubeMatch, findPersonalCopy, playLocalCopy, playNextLocalCopy,
    scanCatalogPersonalLocations, playPreviousLocalCopy, syncPersonalTrackLocations,
    savePersonalAlbumFolder, beginManualPersonalAlbumMatch, browsePersonalArtistFolders,
    browsePersonalAlbumFolders, validatePersonalAlbumFolder,
  };
}
