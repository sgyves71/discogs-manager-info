import { useEffect, useState } from 'react';
import type { DiscogsCollectionSync, DiscogsCollectionSyncInfo, MarketStatsBackfill, MusicLibraryInfo } from '../types';

type ActivePage = 'search' | 'catalog' | 'library' | 'statistics';
const DEFAULT_LIBRARY_PATH = 'H:\\Music\\Rips';

export function useMusicLibraryController(activePage: ActivePage) {
  const [library, setLibrary] = useState<MusicLibraryInfo | null>(null);
  const [libraryPath, setLibraryPath] = useState(DEFAULT_LIBRARY_PATH);
  const [libraryStatus, setLibraryStatus] = useState('');
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [marketStatsBackfill, setMarketStatsBackfill] = useState<MarketStatsBackfill | null>(null);
  const [marketStatsBackfillStatus, setMarketStatsBackfillStatus] = useState('');
  const [discogsCollectionSync, setDiscogsCollectionSync] = useState<DiscogsCollectionSyncInfo | null>(null);
  const [discogsCollectionSyncStatus, setDiscogsCollectionSyncStatus] = useState('');

  useEffect(() => {
    if (activePage !== 'library' && activePage !== 'catalog') return;
    let cancelled = false;
    const loadLibrary = async () => {
      try {
        const response = await fetch('/api/music-library');
        const data = await response.json() as MusicLibraryInfo;
        if (!cancelled) {
          setLibrary(data);
          setLibraryPath((current) => current === DEFAULT_LIBRARY_PATH && data.rootPath ? data.rootPath : current);
        }
      } catch {
        if (!cancelled) setLibraryStatus('Unable to load the local music-library settings.');
      }
    };
    const loadMarketStatsBackfill = async () => {
      try {
        const response = await fetch('/api/catalog-discogs-market-stats-backfill');
        const data = await response.json() as MarketStatsBackfill;
        if (!cancelled) setMarketStatsBackfill(data);
      } catch {
        if (!cancelled) setMarketStatsBackfillStatus('Unable to load valuation-update progress.');
      }
    };
    const loadDiscogsCollectionSync = async () => {
      try {
        const response = await fetch('/api/discogs/collection-sync');
        const data = await response.json() as DiscogsCollectionSyncInfo;
        if (!cancelled) setDiscogsCollectionSync(data);
      } catch {
        if (!cancelled) setDiscogsCollectionSyncStatus('Unable to load Discogs collection-sync status.');
      }
    };
    const loadAll = () => {
      void loadLibrary();
      if (activePage === 'library') { void loadMarketStatsBackfill(); void loadDiscogsCollectionSync(); }
    };
    loadAll();
    const interval = window.setInterval(loadAll, 1500);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [activePage]);

  const saveLibrary = async () => {
    setSavingLibrary(true); setLibraryStatus('Saving music-library folder...');
    try {
      const response = await fetch('/api/music-library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rootPath: libraryPath }) });
      const data = await response.json() as { rootPath?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to save the music-library folder.');
      setLibrary((current) => current ? { ...current, rootPath: data.rootPath ?? null, lastScannedAt: null, trackCount: 0 } : current);
      setLibraryStatus('Music-library folder saved. Scan it to make your tracks available.');
    } catch (error) { setLibraryStatus(error instanceof Error ? error.message : 'Unable to save the music-library folder.'); }
    finally { setSavingLibrary(false); }
  };

  const scanLibrary = async () => {
    setLibraryStatus('Starting music-library scan...');
    try {
      const response = await fetch('/api/music-library/scan', { method: 'POST' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to start the music-library scan.');
      setLibraryStatus('Scanning tagged music files, then matching the complete catalog to your playback collection. You can leave this page while it runs.');
    } catch (error) { setLibraryStatus(error instanceof Error ? error.message : 'Unable to start the music-library scan.'); }
  };

  const startMarketStatsBackfill = async () => {
    if (!window.confirm('Update valuations visits each cataloged Discogs release page one at a time. It may take around 30 minutes for a full collection, but you can keep using the app while it runs. Start the update now?')) return;
    setMarketStatsBackfillStatus('Starting valuation update...');
    try {
      const response = await fetch('/api/catalog-discogs-market-stats-backfill', { method: 'POST' });
      const data = await response.json() as MarketStatsBackfill & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to start the valuation update.');
      setMarketStatsBackfill(data); setMarketStatsBackfillStatus('Valuation update started. You can leave this page while it runs.');
    } catch (error) { setMarketStatsBackfillStatus(error instanceof Error ? error.message : 'Unable to start the valuation update.'); }
  };

  const startDiscogsCollectionSync = async () => {
    if (!discogsCollectionSync) return;
    if (!window.confirm(`Sync your catalog to Discogs? The app will check your Discogs Collection first, then add only missing releases. It will never remove anything from Discogs. Up to ${discogsCollectionSync.pending.toLocaleString()} release${discogsCollectionSync.pending === 1 ? '' : 's'} may be added.`)) return;
    setDiscogsCollectionSyncStatus('Starting Discogs collection sync...');
    try {
      const response = await fetch('/api/discogs/collection-sync', { method: 'POST' });
      const data = await response.json() as DiscogsCollectionSync & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to start the Discogs collection sync.');
      setDiscogsCollectionSync((current) => current ? { ...current, sync: data } : current);
      setDiscogsCollectionSyncStatus('Discogs collection sync started. You can leave this page while it runs.');
    } catch (error) { setDiscogsCollectionSyncStatus(error instanceof Error ? error.message : 'Unable to start the Discogs collection sync.'); }
  };

  return {
    library, setLibrary, libraryPath, setLibraryPath, libraryStatus, setLibraryStatus,
    savingLibrary, setSavingLibrary, marketStatsBackfill, setMarketStatsBackfill,
    marketStatsBackfillStatus, setMarketStatsBackfillStatus, discogsCollectionSync,
    setDiscogsCollectionSync, discogsCollectionSyncStatus, setDiscogsCollectionSyncStatus,
    saveLibrary, scanLibrary, startMarketStatsBackfill, startDiscogsCollectionSync,
  };
}
