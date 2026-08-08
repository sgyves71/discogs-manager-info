import type { CdEntry, DiscogsReleaseTrack, YouTubeVideoMatch } from '../types';
import { releaseMediaApi } from '../api/release-media-api';
import { cleanExternalSearchText, trackDurationSeconds, trackKey } from '../utils/catalog';
import type { CatalogDetailController } from './useCatalogDetailController';

export function useReleaseMediaController(detail: CatalogDetailController, setCollectionStatus: (value: string) => void) {
  const {
    viewedEntry, showDetailImages, setShowDetailImages, detailImages, setDetailImages, setDetailImagesStatus,
    detailTracks, setDetailTracks, setDetailTracksStatus, setShowTracklist, setYouTubeStatus, setYouTubeCandidates,
    setSavedYouTubeMatches, setYouTubePlayer, setLocalAudioPlayer,
  } = detail;

  async function loadDetailImages() {
    if (!viewedEntry?.discogsId) { setDetailImagesStatus('This catalog entry does not have a Discogs release to load images from.'); return; }
    if (showDetailImages) { setShowDetailImages(false); return; }
    setShowDetailImages(true);
    if (detailImages.length) return;
    setDetailImagesStatus('Loading Discogs release images...');
    try {
      const data = await releaseMediaApi.images(viewedEntry.discogsId);
      setDetailImages(data.images ?? []);
      setDetailImagesStatus(data.images?.length ? '' : 'Discogs does not provide additional images for this release.');
    } catch (error) { setDetailImagesStatus(error instanceof Error ? error.message : 'Unable to load release images.'); }
  }

  function openDiscogsRelease(item: CdEntry) {
    const url = item.discogsUri ? `https://www.discogs.com${item.discogsUri}` : item.discogsId ? `https://www.discogs.com/release/${item.discogsId}` : null;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openDiscogsMarketplace(item: CdEntry) {
    if (!item.discogsId) { setCollectionStatus('This catalog entry does not have a Discogs release to search.'); return; }
    window.open(`https://www.discogs.com/sell/release/${item.discogsId}`, '_blank', 'noopener,noreferrer');
  }

  async function loadReleaseTracks(): Promise<DiscogsReleaseTrack[]> {
    if (!viewedEntry?.discogsId) throw new Error('This catalog entry does not have a Discogs release to load a tracklist from.');
    if (detailTracks.length) return detailTracks;
    setDetailTracksStatus('Loading Discogs tracklist...');
    const data = await releaseMediaApi.tracks(viewedEntry.discogsId);
    const tracks = data.tracks ?? [];
    setDetailTracks(tracks);
    setDetailTracksStatus(tracks.length ? '' : 'Discogs does not provide a tracklist for this release.');
    return tracks;
  }

  async function openTracklist() {
    setShowTracklist(true);
    try { await loadReleaseTracks(); } catch (error) { setDetailTracksStatus(error instanceof Error ? error.message : 'Unable to load the tracklist.'); }
  }

  function openTrackOnYouTube(track: DiscogsReleaseTrack) {
    if (!viewedEntry) return;
    const query = [viewedEntry.artist, viewedEntry.title, track.title].map(cleanExternalSearchText).filter(Boolean).join(' ');
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
  }

  async function findYouTubeMatches(track: DiscogsReleaseTrack) {
    if (!viewedEntry) return;
    setYouTubeCandidates(null); setYouTubeStatus(`Finding YouTube matches for “${track.title}”...`);
    try {
      const params = new URLSearchParams({ artist: cleanExternalSearchText(viewedEntry.artist), album: cleanExternalSearchText(viewedEntry.title), track: cleanExternalSearchText(track.title) });
      const duration = trackDurationSeconds(track.duration); if (duration) params.set('durationSeconds', String(duration));
      const data = await releaseMediaApi.youtubeCandidates(params);
      if (!data.videos?.length) { setYouTubeStatus('No good YouTube candidates were returned for this track. Use Search instead.'); return; }
      setYouTubeCandidates({ track, videos: data.videos });
      setYouTubeStatus('Choose the correct match. Your selection will be remembered for this track.');
    } catch (error) { setYouTubeStatus(error instanceof Error ? error.message : 'Unable to find a YouTube match.'); }
  }

  async function chooseYouTubeMatch(track: DiscogsReleaseTrack, video: YouTubeVideoMatch) {
    if (!viewedEntry) return;
    try {
      const saved = await releaseMediaApi.saveYoutubeMatch(viewedEntry.id, { trackKey: trackKey(track), videoId: video.videoId, videoTitle: video.title, videoUrl: video.watchUrl });
      setSavedYouTubeMatches((current) => [...current.filter((match) => match.trackKey !== saved.trackKey), saved]);
      setYouTubeCandidates(null); setYouTubeStatus(`Saved match: ${video.title}`); setLocalAudioPlayer(null);
      setYouTubePlayer({ videoId: video.videoId, title: video.title, watchUrl: video.watchUrl });
    } catch (error) { setYouTubeStatus(error instanceof Error ? error.message : 'Unable to save this YouTube match.'); }
  }

  return { loadDetailImages, openDiscogsRelease, openDiscogsMarketplace, loadReleaseTracks, openTracklist, openTrackOnYouTube, findYouTubeMatches, chooseYouTubeMatch };
}
