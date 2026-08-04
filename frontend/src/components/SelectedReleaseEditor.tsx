import type { FormEventHandler, RefObject } from 'react';

type SelectedRelease = { artist: string; title: string; year: number | null; format: string; label: string | null; catalogNumber: string | null; barcode: string | null };
type ReleaseContext = { genre: string | null; style: string | null };

type SelectedReleaseEditorProps = {
  panelRef: RefObject<HTMLElement>;
  release: SelectedRelease | null;
  context: ReleaseContext | null;
  title: string;
  artist: string;
  notes: string;
  mediaCondition: string;
  estimatedValue: string;
  mediaConditions: string[];
  status: string;
  correcting: boolean;
  saving: boolean;
  onTitleChange: (value: string) => void;
  onArtistChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onMediaConditionChange: (value: string) => void;
  onEstimatedValueChange: (value: string) => void;
  onSave: FormEventHandler<HTMLFormElement>;
  onCancelCorrection: () => void;
};

export function SelectedReleaseEditor({ panelRef, release, context, title, artist, notes, mediaCondition, estimatedValue, mediaConditions, status, correcting, saving, onTitleChange, onArtistChange, onNotesChange, onMediaConditionChange, onEstimatedValueChange, onSave, onCancelCorrection }: SelectedReleaseEditorProps) {
  return <aside className="card selected-release-panel" ref={panelRef} tabIndex={-1}>
    <h2>Selected release</h2>
    {release ? <>
      <div className="selected-release-summary">
        <strong>{release.artist} — {release.title}</strong>
        <div>{release.format || 'Format unknown'}{release.year ? ` • ${release.year}` : ''}</div>
        <div><strong>Label:</strong> {release.label || 'Not listed'}</div>
        <div><strong>Catalog Number:</strong> {release.catalogNumber || 'Not listed'}</div>
        {release.barcode ? <div><strong>Barcode:</strong> {release.barcode}</div> : null}
        {context?.genre ? <div><strong>Genre:</strong> {context.genre}</div> : null}
        {context?.style ? <div><strong>Style:</strong> {context.style}</div> : null}
      </div>
      <form id="catalog-entry-form" onSubmit={onSave}>
        <label>Title</label><input value={release.title || title} onChange={(event) => onTitleChange(event.target.value)} placeholder="Title" />
        <label>Artist</label><input value={release.artist || artist} onChange={(event) => onArtistChange(event.target.value)} placeholder="Artist" />
        <label>Notes</label><textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Condition, purchase details, etc." />
        <label>Media Condition</label><select value={mediaCondition} onChange={(event) => onMediaConditionChange(event.target.value)}><option value="">Not specified</option>{mediaConditions.map((condition) => <option key={condition} value={condition}>{condition}</option>)}</select>
        <label>Estimated Value</label><input type="number" min="0" step="0.01" value={estimatedValue} onChange={(event) => onEstimatedValueChange(event.target.value)} placeholder="15.00" />
        {status ? <p className="status">{status}</p> : null}
        {correcting ? <div className="form-actions"><button type="button" className="secondary-button" onClick={onCancelCorrection}>Cancel Correction</button></div> : null}
        <div className="form-actions"><button type="submit" disabled={saving}>{correcting ? 'Apply Corrected Match' : 'Add to Catalog'}</button></div>
      </form>
    </> : <p className="hint">Select a release result to review it and add it to your catalog.</p>}
  </aside>;
}
