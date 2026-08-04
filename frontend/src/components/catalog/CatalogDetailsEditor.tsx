import type { FormEvent } from 'react';
import type { CatalogDetailsForm } from '../../types';

type Props = {
  value: CatalogDetailsForm;
  mediaConditions: string[];
  status: string;
  saving: boolean;
  onChange: (value: CatalogDetailsForm) => void;
  onSave: (event: FormEvent) => void;
  onCancel: () => void;
};

export function CatalogDetailsEditor({ value, mediaConditions, status, saving, onChange, onSave, onCancel }: Props) {
  const setField = <K extends keyof CatalogDetailsForm>(field: K, fieldValue: CatalogDetailsForm[K]) => {
    onChange({ ...value, [field]: fieldValue });
  };

  return <form className="detail-section catalog-details-editor" onSubmit={onSave}>
    <strong>Edit Catalog Details</strong>
    <div className="catalog-details-fields">
      <label>Artist<input value={value.artist} onChange={(event) => setField('artist', event.target.value)} /></label>
      <label>Album Title<input value={value.title} onChange={(event) => setField('title', event.target.value)} /></label>
      <label>Year<input type="number" min="1000" max="9999" value={value.year} onChange={(event) => setField('year', event.target.value)} /></label>
      <label>Country<input value={value.country} onChange={(event) => setField('country', event.target.value)} /></label>
      <label>Label<input value={value.label} onChange={(event) => setField('label', event.target.value)} /></label>
      <label>Format<input value={value.format} onChange={(event) => setField('format', event.target.value)} /></label>
      <label>Catalog Number<input value={value.catalogNumber} onChange={(event) => setField('catalogNumber', event.target.value)} /></label>
      <label>Barcode<input value={value.barcode} onChange={(event) => setField('barcode', event.target.value)} /></label>
      <label>Media Condition<select value={value.mediaCondition} onChange={(event) => setField('mediaCondition', event.target.value)}><option value="">Not specified</option>{mediaConditions.map((condition) => <option key={condition} value={condition}>{condition}</option>)}</select></label>
    </div>
    <label>Notes<textarea value={value.notes} onChange={(event) => setField('notes', event.target.value)} /></label>
    <div className="form-actions"><button type="submit" disabled={saving}>Save Details</button><button type="button" className="secondary-button" disabled={saving} onClick={onCancel}>Cancel</button></div>
    {status ? <p className="hint">{status}</p> : null}
  </form>;
}
