import type { ReactNode } from 'react';

type ModalDialogProps = { label: string; onClose: () => void; children: ReactNode; className?: string };

export function ModalDialog({ label, onClose, children, className = 'artist-summary-dialog' }: ModalDialogProps) {
  return <div className="artist-summary-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={className} role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="dialog-close-button dialog-close-sticky" aria-label={`Close ${label}`} title="Close" onClick={onClose}>×</button>
      {children}
    </section>
  </div>;
}
