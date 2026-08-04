export type CdEntry = {
  id: number;
  title: string;
  artist: string;
  year: number | null;
  country: string | null;
  label: string | null;
  format: string | null;
  genre?: string | null;
  style?: string | null;
  estimatedValue: number | null;
  estimatedValueIsManual?: boolean;
  estimatedValueReviewedAt?: string | null;
  notes: string | null;
  discogsId: number | null;
  discogsUri: string | null;
  catalogNumber: string | null;
  barcode: string | null;
  mediaCondition: string | null;
  valueLastCheckedAt: string | null;
  discogsLastSoldAt?: string | null;
  discogsMarketLow?: number | null;
  discogsMarketMedian?: number | null;
  discogsMarketHigh?: number | null;
  discogsMarketCurrency?: string | null;
  discogsMarketStatsCheckedAt?: string | null;
  hasCover?: boolean;
  coverImageUpdatedAt?: string | null;
  artistSummary?: string | null;
  discogsNotes?: string | null;
  discogsNotesSource?: 'release' | 'album' | 'artist' | null;
  discogsContextUpdatedAt?: string | null;
  personalAlbumFolderPath?: string | null;
  personalAlbumFolderMappedAt?: string | null;
};

export type MusicLibraryInfo = {
  rootPath: string | null;
  lastScannedAt: string | null;
  trackCount: number;
  scan: { status: 'idle' | 'scanning' | 'complete' | 'failed'; scannedFiles: number; indexedFiles: number; skippedFiles: number; error: string | null };
  catalogLocationScan: { status: 'idle' | 'scanning' | 'complete' | 'failed'; total: number; processed: number; matched: number; alreadyMapped: number; unmatched: number; error: string | null };
};

export type MarketStatsBackfill = {
  status: 'idle' | 'running' | 'complete' | 'failed';
  processed: number;
  stored?: number;
  skipped: number;
  total: number;
  error: string | null;
};

export type DiscogsCollectionSync = {
  status: 'idle' | 'running' | 'complete' | 'failed';
  total: number;
  processed: number;
  added: number;
  alreadyInCollection: number;
  skipped: number;
  failed: number;
  username: string | null;
  error: string | null;
};

export type DiscogsCollectionSyncInfo = {
  configured: boolean;
  eligible: number;
  previouslySynced: number;
  pending: number;
  sync: DiscogsCollectionSync;
};
