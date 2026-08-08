import type { DiscogsCollectionSyncInfo, MarketStatsBackfill, MusicLibraryInfo } from '../../types';

type MusicLibraryPageProps = {
  library: MusicLibraryInfo | null;
  libraryPath: string;
  libraryStatus: string;
  savingLibrary: boolean;
  marketStatsBackfill: MarketStatsBackfill | null;
  marketStatsBackfillStatus: string;
  discogsCollectionSync: DiscogsCollectionSyncInfo | null;
  discogsCollectionSyncStatus: string;
  onLibraryPathChange: (value: string) => void;
  onSaveLibrary: () => void;
  onScanLibrary: () => void;
  onUpdateValuations: () => void;
  onSyncDiscogsCollection: () => void;
};

export function MusicLibraryPage({
  library, libraryPath, libraryStatus, savingLibrary, marketStatsBackfill, marketStatsBackfillStatus,
  discogsCollectionSync, discogsCollectionSyncStatus, onLibraryPathChange, onSaveLibrary, onScanLibrary,
  onUpdateValuations, onSyncDiscogsCollection,
}: MusicLibraryPageProps) {
  return <>
    <h1>Music Library</h1>
    <p>Connect the folder containing your personally ripped and tagged music. Files remain on this PC and are only streamed locally when you choose to play one.</p>
    <div className="card music-library-card">
      <h2>Personal music folder</h2>
      <label htmlFor="music-library-path">Library Folder</label>
      <input id="music-library-path" value={libraryPath} onChange={(event) => onLibraryPathChange(event.target.value)} placeholder="H:\\Music\\Rips" />
      <div className="form-actions">
        <button type="button" onClick={onSaveLibrary} disabled={savingLibrary || !libraryPath.trim()}>{savingLibrary ? 'Saving...' : 'Save Folder'}</button>
        <button type="button" className="secondary-button" onClick={onScanLibrary} disabled={!library?.rootPath || library.scan.status === 'scanning'}>{library?.scan.status === 'scanning' ? (library.catalogLocationScan.status === 'scanning' ? 'Matching Catalog...' : 'Scanning...') : 'Scan Library'}</button>
      </div>
      {library?.rootPath ? <div className="music-library-summary"><strong>Current folder:</strong> {library.rootPath}<br /><strong>Indexed tracks:</strong> {library.trackCount.toLocaleString()}{library.lastScannedAt ? <> · last scan {new Date(library.lastScannedAt).toLocaleString()}</> : null}</div> : <p className="hint">Save the folder first, then run the initial scan.</p>}
      {library?.scan.status === 'scanning' && library.catalogLocationScan.status !== 'scanning' ? <p className="hint">Step 1 of 2 — scanning disk: {library.scan.scannedFiles.toLocaleString()} files checked · {library.scan.indexedFiles.toLocaleString()} indexed · {library.scan.skippedFiles.toLocaleString()} skipped</p> : null}
      {library?.scan.status === 'failed' ? <p className="hint">Scan failed: {library.scan.error}</p> : null}
      {libraryStatus ? <p className="hint">{libraryStatus}</p> : null}
    </div>
    <div className="card music-library-card">
      <h2>Catalog Local Copies</h2>
      <p>Every Scan Library run now follows disk indexing with a whole-catalog matching pass, saving high-confidence links to albums found in your playback collection.</p>
      {library?.catalogLocationScan.status === 'scanning' ? <p className="hint">Step 2 of 2 — matching catalog: {library.catalogLocationScan.processed.toLocaleString()} / {library.catalogLocationScan.total.toLocaleString()} catalog albums checked · {library.catalogLocationScan.matched.toLocaleString()} new matches · {library.catalogLocationScan.alreadyMapped.toLocaleString()} already linked</p> : null}
      {library?.catalogLocationScan.status === 'complete' ? <p className="hint">Complete: {library.catalogLocationScan.processed.toLocaleString()} catalog albums checked · {library.catalogLocationScan.matched.toLocaleString()} new matches · {library.catalogLocationScan.alreadyMapped.toLocaleString()} existing links retained · {library.catalogLocationScan.unmatched.toLocaleString()} not found.</p> : null}
      {library?.catalogLocationScan.status === 'failed' ? <p className="hint">Catalog local-copy matching failed: {library.catalogLocationScan.error || 'Unknown error.'}</p> : null}
    </div>
    <div className="card music-library-card">
      <h2>Catalog valuations</h2>
      <p>Refresh Discogs Last Sold, Low, Median, and High values for every catalog entry with a Discogs release. The process runs in the background at a respectful pace.</p>
      <div className="form-actions"><button type="button" onClick={onUpdateValuations} disabled={marketStatsBackfill?.status === 'running'}>{marketStatsBackfill?.status === 'running' ? 'Updating Valuations...' : 'Update Valuations'}</button></div>
      {marketStatsBackfill?.status === 'running' ? <p className="hint">Progress: {marketStatsBackfill.processed.toLocaleString()} / {marketStatsBackfill.total.toLocaleString()} releases checked - {marketStatsBackfill.stored ?? 0} with market data - {marketStatsBackfill.skipped.toLocaleString()} unavailable</p> : null}
      {marketStatsBackfill?.status === 'complete' ? <p className="hint">Last update complete: {marketStatsBackfill.processed.toLocaleString()} releases checked - {marketStatsBackfill.stored ?? 0} with market data - {marketStatsBackfill.skipped.toLocaleString()} unavailable.</p> : null}
      {marketStatsBackfill?.status === 'failed' ? <p className="hint">Valuation update failed: {marketStatsBackfill.error || 'Unknown error.'}</p> : null}
      {marketStatsBackfillStatus ? <p className="hint">{marketStatsBackfillStatus}</p> : null}
    </div>
    <div className="card music-library-card">
      <h2>Discogs Collection Sync</h2>
      <p>Add your cataloged Discogs releases to your authenticated Discogs Collection. The app checks what you already have first and never removes remote entries.</p>
      {!discogsCollectionSync?.configured ? <p className="hint">Discogs authentication is not configured.</p> : <>
        <p className="hint">{discogsCollectionSync.eligible.toLocaleString()} catalog releases can sync · {discogsCollectionSync.previouslySynced.toLocaleString()} previously recorded as synced · up to {discogsCollectionSync.pending.toLocaleString()} pending.</p>
        <div className="form-actions"><button type="button" onClick={onSyncDiscogsCollection} disabled={discogsCollectionSync.sync.status === 'running'}>{discogsCollectionSync.sync.status === 'running' ? 'Syncing Discogs Collection...' : 'Sync Catalog to Discogs'}</button></div>
        {discogsCollectionSync.sync.status === 'running' ? <p className="hint">Progress: {discogsCollectionSync.sync.processed.toLocaleString()} / {discogsCollectionSync.sync.total.toLocaleString()} · {discogsCollectionSync.sync.added.toLocaleString()} added · {discogsCollectionSync.sync.alreadyInCollection.toLocaleString()} already in Discogs.</p> : null}
        {discogsCollectionSync.sync.status === 'complete' ? <p className="hint">Sync complete{discogsCollectionSync.sync.username ? ` for ${discogsCollectionSync.sync.username}` : ''}: {discogsCollectionSync.sync.added.toLocaleString()} added · {discogsCollectionSync.sync.alreadyInCollection.toLocaleString()} already in Discogs · {discogsCollectionSync.sync.failed.toLocaleString()} failed.</p> : null}
        {discogsCollectionSync.sync.status === 'failed' ? <p className="hint">Sync failed: {discogsCollectionSync.sync.error || 'Unknown error.'}</p> : null}
      </>}
      {discogsCollectionSyncStatus ? <p className="hint">{discogsCollectionSyncStatus}</p> : null}
    </div>
  </>;
}
