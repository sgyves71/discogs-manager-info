import { useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';

const LOCAL_AUDIO_VOLUME_KEY = 'discogs-manager.local-audio-volume';

function initialVolume(): number {
  try {
    const storedValue = window.localStorage.getItem(LOCAL_AUDIO_VOLUME_KEY);
    if (storedValue === null) return 1;
    const storedVolume = Number(storedValue);
    return Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1 ? storedVolume : 1;
  } catch {
    return 1;
  }
}

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
  const [volume, setVolume] = useState(initialVolume);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useLayoutEffect(() => {
    if (audioRef.current && audioRef.current.volume !== volume) audioRef.current.volume = volume;
  }, [trackId, volume]);

  function rememberVolume(event: SyntheticEvent<HTMLAudioElement>) {
    const nextVolume = event.currentTarget.volume;
    setVolume(nextVolume);
    try {
      window.localStorage.setItem(LOCAL_AUDIO_VOLUME_KEY, String(nextVolume));
    } catch {
      // Playback still works when storage is unavailable; volume persists for this mounted player.
    }
  }

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
        <button type="button" className="secondary-button player-skip-button" aria-label="Previous track" title="Previous track" onClick={onPrevious}><span aria-hidden="true">⏮</span></button>
        <button type="button" className="secondary-button player-skip-button" aria-label="Next track" title="Next track" onClick={onNext}><span aria-hidden="true">⏭</span></button>
      </div>
      <audio
        key={trackId}
        ref={audioRef}
        controls
        autoPlay
        preload="metadata"
        src={`/api/music-library/tracks/${trackId}/stream`}
        onPlay={() => setErrorMessage('')}
        onEnded={onEnded}
        onError={handleError}
        onVolumeChange={rememberVolume}
      />
      {errorMessage ? <span className="local-audio-player-error">{errorMessage}</span> : null}
    </aside>
  );
}
