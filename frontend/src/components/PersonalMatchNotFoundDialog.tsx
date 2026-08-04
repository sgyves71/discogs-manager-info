import { ModalDialog } from './ModalDialog';

export function PersonalMatchNotFoundDialog({ title, onManualMatch, onClose }: { title: string; onManualMatch: () => void; onClose: () => void }) {
  return <ModalDialog label="Personal music match not found" onClose={onClose}>
    <div className="artist-summary-dialog-header"><h2>No personal match found</h2></div>
    <p>No tagged local match was found for <strong>{title}</strong>. If you believe the track is in your scanned music collection, you can make a manual album-folder match.</p>
    <div className="form-actions"><button type="button" onClick={onManualMatch}>Yes, Make Manual Match</button><button type="button" className="secondary-button" onClick={onClose}>No, Not Now</button></div>
  </ModalDialog>;
}
