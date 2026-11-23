type Props = { value: string; status: string; saving: boolean; onChange: (value: string) => void; onSave: () => void; onCancel: () => void };

export function EstimatedValueEditor({ value, status, saving, onChange, onSave, onCancel }: Props) {
  return <div className="detail-section estimated-value-editor">
    <strong>Update estimated value</strong>
    <div className="inline-form">
      <input type="number" min="0" step="0.01" disabled={saving} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Leave blank to clear" aria-label="Estimated value" />
      <button type="button" disabled={saving} onClick={onSave}>Save Value</button>
      <button type="button" className="secondary-button" disabled={saving} onClick={onCancel}>Cancel</button>
    </div>
    {status ? <p className="hint">{status}</p> : null}
  </div>;
}
