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

export type DiscogsReleaseTrack = {
  position: string | null;
  title: string;
  duration: string | null;
  isComposite?: boolean;
};

export type YouTubeVideoMatch = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  watchUrl: string;
  embedUrl: string;
  durationSeconds: number | null;
  score: number;
};

export type SavedYouTubeTrackMatch = {
  trackKey: string;
  videoId: string;
  videoTitle: string;
  videoUrl: string;
};

export type YouTubePlayer = {
  videoId: string;
  title: string;
  watchUrl: string;
};

export type PersonalTrackMatch = {
  trackKey: string;
  libraryTrack: {
    id: number;
    artist: string;
    album: string;
    title: string;
    trackNumber: number | null;
    format: string | null;
  };
};

export type CatalogDetailsForm = {
  title: string;
  artist: string;
  year: string;
  country: string;
  label: string;
  format: string;
  catalogNumber: string;
  barcode: string;
  mediaCondition: string;
  notes: string;
};

export type CatalogStatistics = {
  totalEntries: number;
  discogsMedian: { count: number; total: number };
  estimatedValue: { count: number; total: number };
  styles: Array<{ style: string; count: number; percentage: number }>;
  decades: Array<{ decade: string; count: number; percentage: number }>;
};

export type DiscogsResult = {
  id: number;
  title: string;
  artist: string;
  year: number | null;
  country: string | null;
  label: string | null;
  format: string;
  uri: string;
  thumb: string | null;
  coverImage: string | null;
  catalogNumber: string | null;
  barcode: string | null;
  lowestPrice: number | null;
};
