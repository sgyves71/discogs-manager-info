import type { RefObject } from 'react';

type SearchField = 'artist' | 'albumTitle' | 'catalogNumber' | 'barcode';

type SearchScanControlsProps = {
  artist: string;
  albumTitle: string;
  catalogNumber: string;
  barcode: string;
  loading: boolean;
  includeDiscogsMarketStats: boolean;
  includeEbayAuctionValues: boolean;
  voiceListening: boolean;
  voiceStatus: string;
  scannerOpen: boolean;
  scannerStatus: string;
  scannerVideoRef: RefObject<HTMLVideoElement>;
  onFieldChange: (field: SearchField, value: string) => void;
  onSearch: () => void;
  onClear: () => void;
  onIncludeDiscogsMarketStatsChange: (enabled: boolean) => void;
  onIncludeEbayAuctionValuesChange: (enabled: boolean) => void;
  onVoiceToggle: () => void;
  onOpenScanner: () => void;
  onCloseScanner: () => void;
};

export function SearchScanControls({
  artist, albumTitle, catalogNumber, barcode, loading, includeDiscogsMarketStats, includeEbayAuctionValues,
  voiceListening, voiceStatus, scannerOpen, scannerStatus, scannerVideoRef, onFieldChange, onSearch, onClear,
  onIncludeDiscogsMarketStatsChange, onIncludeEbayAuctionValuesChange, onVoiceToggle, onOpenScanner, onCloseScanner,
}: SearchScanControlsProps) {
  const hasSearchCriteria = Boolean(artist.trim() || albumTitle.trim() || catalogNumber.trim() || barcode.trim());
  return <>
    <label>Search Discogs</label>
    <form className="search-form" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
      <div className="search-input-grid">
        <input value={artist} onChange={(event) => onFieldChange('artist', event.target.value)} placeholder="Artist" />
        <input value={albumTitle} onChange={(event) => onFieldChange('albumTitle', event.target.value)} placeholder="Album Title" />
        <div className="catalog-number-voice-input">
          <input value={catalogNumber} onChange={(event) => onFieldChange('catalogNumber', event.target.value)} placeholder="Catalog Number" aria-label="Catalog Number" />
          <button type="button" className="secondary-button catalog-voice-button" onClick={onVoiceToggle} aria-label={voiceListening ? 'Stop catalog number voice entry' : 'Speak catalog number'} title={voiceListening ? 'Stop listening' : 'Speak catalog number'}>{voiceListening ? 'Stop Listening' : '🎙 Speak'}</button>
        </div>
        <input value={barcode} onChange={(event) => onFieldChange('barcode', event.target.value)} placeholder="Barcode" />
      </div>
      <div className="search-actions">
        <button type="submit" disabled={loading || !hasSearchCriteria}>{loading ? 'Searching...' : 'Look Up'}</button>
        <button type="button" className="secondary-button" onClick={onClear} disabled={loading}>Clear</button>
        <label className="ebay-search-toggle"><input type="checkbox" checked={includeDiscogsMarketStats} onChange={(event) => onIncludeDiscogsMarketStatsChange(event.target.checked)} /> Include Discogs Market Statistics</label>
        <label className="ebay-search-toggle"><input type="checkbox" checked={includeEbayAuctionValues} onChange={(event) => onIncludeEbayAuctionValuesChange(event.target.checked)} /> Include Current eBay Auction Values</label>
      </div>
      {voiceStatus ? <p className="hint catalog-voice-status" aria-live="polite">{voiceStatus}</p> : null}
    </form>
    <div className="search-section-divider" />
    <section className="scanner-section">
      <h3>Barcode scanner</h3>
      <p className="hint">Use your phone camera to fill the barcode search field automatically.</p>
      <button type="button" onClick={onOpenScanner}>Scan Barcode</button>
    </section>
    {scannerOpen && <div className="scanner-dialog" role="dialog" aria-modal="true" aria-label="Barcode scanner">
      <button type="button" className="dialog-close-button scanner-close" aria-label="Close barcode scanner" title="Close" onClick={onCloseScanner}>×</button>
      <video ref={scannerVideoRef} className="scanner-video" muted playsInline />
      <p>{scannerStatus}</p>
    </div>}
  </>;
}
