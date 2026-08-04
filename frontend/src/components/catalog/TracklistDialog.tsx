import { useState } from 'react';
import type {
  DiscogsReleaseTrack,
  PersonalTrackMatch,
  SavedYouTubeTrackMatch,
  YouTubePlayer,
  YouTubeVideoMatch,
} from '../../types';
import { sharedPhysicalTrackPosition } from '../../utils/catalog';

type YouTubeCandidates = { track: DiscogsReleaseTrack; videos: YouTubeVideoMatch[] };

type TracklistDialogProps = {
  artist: string;
  albumTitle: string;
  tracks: DiscogsReleaseTrack[];
  trackStatus: string;
  personalMusicStatus: string;
  youTubeStatus: string;
  personalLocationSyncing: boolean;
  youTubeCandidates: YouTubeCandidates | null;
  youTubePlayer: YouTubePlayer | null;
  savedYouTubeMatches: SavedYouTubeTrackMatch[];
  personalTrackMatches: PersonalTrackMatch[];
  trackKey: (track: DiscogsReleaseTrack) => string;
  onClose: () => void;
  onSyncPersonalLocations: () => void;
  onChooseYouTubeMatch: (track: DiscogsReleaseTrack, video: YouTubeVideoMatch) => void;
  onCancelYouTubeCandidates: () => void;
  onCloseYouTubePlayer: () => void;
  onPlaySavedMatch: (match: SavedYouTubeTrackMatch) => void;
  onFindPersonalCopy: (track: DiscogsReleaseTrack) => void;
  onPlayPersonalCopy: (match: PersonalTrackMatch) => void;
  onFindYouTubeMatches: (track: DiscogsReleaseTrack) => void;
  onSearchYouTube: (track: DiscogsReleaseTrack) => void;
};

export function TracklistDialog({
  artist,
  albumTitle,
  tracks,
  trackStatus,
  personalMusicStatus,
  youTubeStatus,
  personalLocationSyncing,
  youTubeCandidates,
  youTubePlayer,
  savedYouTubeMatches,
  personalTrackMatches,
  trackKey,
  onClose,
  onSyncPersonalLocations,
  onChooseYouTubeMatch,
  onCancelYouTubeCandidates,
  onCloseYouTubePlayer,
  onPlaySavedMatch,
  onFindPersonalCopy,
  onPlayPersonalCopy,
  onFindYouTubeMatches,
  onSearchYouTube,
}: TracklistDialogProps) {
  const [openOptionsTrackKey, setOpenOptionsTrackKey] = useState<string | null>(null);
  return (
    <div className="tracklist-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
      else if (event.target instanceof Element && !event.target.closest('.track-options-menu')) setOpenOptionsTrackKey(null);
    }}>
      <section className="tracklist-popover" role="dialog" aria-modal="true" aria-label={`Tracklist for ${albumTitle}`}>
        <button type="button" className="dialog-close-button dialog-close-sticky" aria-label="Close tracklist" title="Close" onClick={onClose}>×</button>
        <div className="tracklist-header">
          <div><h3>Tracklist</h3><p>{artist} — {albumTitle}</p></div>
          <button type="button" className="secondary-button" disabled={!tracks.length || personalLocationSyncing} onClick={onSyncPersonalLocations}>
            {personalLocationSyncing ? 'Syncing Locations...' : 'Sync Personal Locations'}
          </button>
        </div>
        {trackStatus ? <p className="hint">{trackStatus}</p> : null}
        {personalMusicStatus ? <p className="hint">{personalMusicStatus}</p> : null}
        {youTubeStatus ? <p className="hint">{youTubeStatus}</p> : null}
        {youTubeCandidates ? (
          <div className="youtube-candidate-panel">
            <strong>Choose a YouTube match for “{youTubeCandidates.track.title}”</strong>
            <div className="youtube-candidate-list">
              {youTubeCandidates.videos.map((video) => (
                <div className="youtube-candidate" key={video.videoId}>
                  {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" /> : <div className="youtube-candidate-thumbnail">No image</div>}
                  <div>
                    <strong>{video.title}</strong>
                    {video.channelTitle ? <span>{video.channelTitle}</span> : null}
                    {video.durationSeconds ? <span>{Math.floor(video.durationSeconds / 60)}:{String(video.durationSeconds % 60).padStart(2, '0')}</span> : null}
                  </div>
                  <button type="button" onClick={() => onChooseYouTubeMatch(youTubeCandidates.track, video)}>Use This Match</button>
                </div>
              ))}
            </div>
            <button type="button" className="secondary-button" onClick={onCancelYouTubeCandidates}>Cancel</button>
          </div>
        ) : null}
        {youTubePlayer ? (
          <div className="youtube-player-overlay" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCloseYouTubePlayer();
          }}>
            <section className="youtube-player-popover" role="dialog" aria-modal="true" aria-label={`Playing ${youTubePlayer.title}`}>
              <button type="button" className="dialog-close-button dialog-close-sticky" aria-label="Close YouTube player" title="Close" onClick={onCloseYouTubePlayer}>×</button>
              <div className="youtube-player-header"><strong>{youTubePlayer.title}</strong></div>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youTubePlayer.videoId)}?autoplay=1&rel=0`}
                title={`YouTube player: ${youTubePlayer.title}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
              <p className="hint">If this video cannot be embedded, <a href={youTubePlayer.watchUrl} target="_blank" rel="noreferrer">open it on YouTube</a>.</p>
            </section>
          </div>
        ) : null}
        {tracks.length ? <ol className="tracklist">
          {tracks.map((track, index) => {
            const currentTrackKey = trackKey(track);
            const savedMatch = savedYouTubeMatches.find((match) => match.trackKey === currentTrackKey);
            const personalMatch = personalTrackMatches.find((match) => match.trackKey === currentTrackKey);
            const sharedPosition = sharedPhysicalTrackPosition(tracks, track);
            const sharesLocalFile = Boolean(personalMatch && personalTrackMatches.some((match) => match.trackKey !== personalMatch.trackKey
              && match.libraryTrack.id === personalMatch.libraryTrack.id));
            return (
              <li key={`${track.position ?? index}-${track.title}`}>
                <span className="track-position">{track.position || index + 1}</span>
                <span className="track-title">{track.title}</span>
                {track.duration ? <span className="track-duration">{track.duration}</span> : null}
                {sharedPosition && sharesLocalFile ? <span className="track-suite-note">Part of physical track {sharedPosition} — shares one local audio file</span> : null}
                {track.isComposite ? <span className="track-suite-note">Suite — individual movements are listed below</span> : <div className="track-actions">
                  <button type="button" className="track-local-action" onClick={() => personalMatch ? onPlayPersonalCopy(personalMatch) : onFindPersonalCopy(track)}>{personalMatch ? '▶ Play' : 'Find Local'}</button>
                  <div className="track-options-menu">
                    <button type="button" className="track-options-trigger" aria-label={`More options for ${track.title}`} aria-expanded={openOptionsTrackKey === currentTrackKey} title="More track options" onClick={() => setOpenOptionsTrackKey((openKey) => openKey === currentTrackKey ? null : currentTrackKey)}>•••</button>
                    {openOptionsTrackKey === currentTrackKey ? <div className="track-options-items">
                      {savedMatch ? <button type="button" onClick={() => { setOpenOptionsTrackKey(null); onPlaySavedMatch(savedMatch); }}>Play Saved Match</button> : null}
                      <button type="button" onClick={() => { setOpenOptionsTrackKey(null); onFindYouTubeMatches(track); }}>{savedMatch ? 'Change YouTube Match' : 'Find YouTube Matches'}</button>
                      <button type="button" onClick={() => { setOpenOptionsTrackKey(null); onSearchYouTube(track); }}>Search YouTube</button>
                    </div> : null}
                  </div>
                </div>}
              </li>
            );
          })}
        </ol> : null}
      </section>
    </div>
  );
}
