type LocalAudioPlayerProps = {
  trackId: number;
  title: string;
  subtitle: string;
  onClose: () => void;
  onError: () => void;
};

export function LocalAudioPlayer({ trackId, title, subtitle, onClose, onError }: LocalAudioPlayerProps) {
  return (
    <aside className="local-audio-player" aria-label={`Playing local copy of ${title}`}>
      <div><strong>{title}</strong><span>{subtitle}</span></div>
      <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      <audio key={trackId} controls autoPlay src={`/api/music-library/tracks/${trackId}/stream`} onError={onError} />
    </aside>
  );
}
