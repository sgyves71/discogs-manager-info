type ArtistSummaryDialogProps = {
  summary: string;
  onClose: () => void;
};

export function ArtistSummaryDialog({ summary, onClose }: ArtistSummaryDialogProps) {
  return (
    <div className="artist-summary-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="artist-summary-dialog" role="dialog" aria-modal="true" aria-label="Full artist summary">
        <div className="artist-summary-dialog-header">
          <h2>Artist summary</h2>
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        </div>
        <p>{summary}</p>
      </section>
    </div>
  );
}
