import { useState, type SyntheticEvent } from 'react';

type LocalAudioPlayerProps = {
  trackId: number;
  title: string;
  subtitle: string;
  onEnded: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  onError: (message: string) => void;
};

export function LocalAudioPlayer({ trackId, title, subtitle, onEnded, onPrevious, onNext, onClose, onError }: LocalAudioPlayerProps) {
  const [errorMessage, setErrorMessage] = useState('');

  function handleError(event: SyntheticEvent<HTMLAudioElement>) {
    const code = event.currentTarget.error?.code;
    const message = code === 1
      ? 'Local playback was stopped before the track could start.'
      : code === 2
        ? 'The phone could not load this local audio stream. Check that it is connected to the same home network, then try again.'
        : code === 3
          ? 'This device could not decode this audio file.'
          : code === 4
            ? 'This device does not support the local audio stream for this track.'
            : 'The local audio stream could not be played.';
    setErrorMessage(message);
    onError(message);
  }

  return (
    <aside className="local-audio-player" aria-label={`Playing local copy of ${title}`}>
      <div><strong>{title}</strong><span>{subtitle}</span></div>
      <button type="button" className="dialog-close-button" aria-label="Close audio player" title="Close player" onClick={onClose}>×</button>
      <div className="local-audio-player-navigation" aria-label="Playback navigation">
        <button type="button" className="secondary-button" onClick={onPrevious}>Previous</button>
        <button type="button" className="secondary-button" onClick={onNext}>Next</button>
      </div>
      <audio
        key={trackId}
        controls
        autoPlay
        preload="metadata"
        src={`/api/music-library/tracks/${trackId}/stream`}
        onPlay={() => setErrorMessage('')}
        onEnded={onEnded}
        onError={handleError}
      />
      {errorMessage ? <span className="local-audio-player-error">{errorMessage}</span> : null}
    </aside>
  );
}
