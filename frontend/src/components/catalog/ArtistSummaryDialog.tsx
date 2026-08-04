type ArtistSummaryDialogProps = {
  summary: string;
  onClose: () => void;
};

export function ArtistSummaryDialog({ summary, onClose }: ArtistSummaryDialogProps) {
  return (
    <div className="artist-summary-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="artist-summary-dialog" role="dialog" aria-modal="true" aria-label="Full artist summary">
        <button type="button" className="dialog-close-button dialog-close-sticky" aria-label="Close artist summary" title="Close" onClick={onClose}>×</button>
        <div className="artist-summary-dialog-header">
          <h2>Artist summary</h2>
        </div>
        <p>{summary}</p>
      </section>
    </div>
  );
}
