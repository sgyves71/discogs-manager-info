type Props = { label?: string };

export function PlaybackUnavailableIcon({ label = 'Album not found in playback collection' }: Props) {
  return <span className="catalog-playback-missing" role="img" aria-label={label} title={label}>
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" />
      <path d="M7.5 13h5l6-5v16l-6-5h-5z" />
      <path d="M21 12c1.5 1.1 2.3 2.4 2.3 4s-.8 2.9-2.3 4" />
      <path className="catalog-playback-missing-slash" d="M6 6l20 20" />
    </svg>
  </span>;
}
