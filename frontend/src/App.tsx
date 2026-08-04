import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BarcodeFormat, BrowserMultiFormatReader } from '@zxing/browser';
import { ArtistSummaryDialog } from './components/ArtistSummaryDialog';
import { CatalogPage } from './components/CatalogPage';
import { LocalAudioPlayer } from './components/LocalAudioPlayer';
import type { CdEntry } from './types';

type CatalogDetailsForm = {
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

type DiscogsResult = {
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

type EBayActiveListingStats = {
  listingCount: number;
  sampledListingCount: number;
  lowestPrice: number | null;
  averagePrice: number | null;
  highestPrice: number | null;
  currency: string | null;
  searchMethod: 'catalogNumber' | 'artistTitle';
};

type DiscogsMarketStats = {
  lastSoldAt: string | null;
  low: number | null;
  median: number | null;
  high: number | null;
  currency: string | null;
};

type DiscogsReleaseContext = {
  description: string | null;
  descriptionSource: 'release' | 'album' | 'artist' | null;
  artistProfile: string | null;
  genre: string | null;
  style: string | null;
};

type MusicBrainzCatalogContext = {
  artist: {
    id: string;
    name: string;
    type: string | null;
    country: string | null;
    disambiguation: string | null;
    beginDate: string | null;
    endDate: string | null;
    ended: boolean | null;
    annotation: string | null;
    genres: string[];
  } | null;
  releaseGroup: {
    id: string;
    title: string;
    primaryType: string | null;
    firstReleaseDate: string | null;
    annotation: string | null;
    genres: string[];
  } | null;
};

type SearchReleaseDetailsCache = {
  release: DiscogsResult;
  catalogInfoLoaded?: boolean;
  context?: DiscogsReleaseContext;
  ebay?: { stats: EBayActiveListingStats; status: string };
  marketStats?: { stats: DiscogsMarketStats; status: string };
};

type DiscogsReleaseImage = {
  url: string;
  thumbnailUrl: string;
};

type DiscogsReleaseTrack = {
  position: string | null;
  title: string;
  duration: string | null;
  isComposite?: boolean;
};

type MarketStatsBackfill = {
  status: 'idle' | 'running' | 'complete' | 'failed';
  processed: number;
  stored?: number;
  skipped: number;
  total: number;
  error: string | null;
};

type DiscogsCollectionSync = {
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

type DiscogsCollectionSyncInfo = {
  configured: boolean;
  eligible: number;
  previouslySynced: number;
  pending: number;
  sync: DiscogsCollectionSync;
};

type CatalogStatistics = {
  totalEntries: number;
  discogsMedian: { count: number; total: number };
  estimatedValue: { count: number; total: number };
  styles: Array<{ style: string; count: number; percentage: number }>;
  decades: Array<{ decade: string; count: number; percentage: number }>;
};

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<SpeechRecognitionAlternativeLike>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function normalizeSpokenCatalogNumber(value: string): string {
  const spokenDigits: Record<string, string> = {
    zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9',
  };
  return value
    .toLowerCase()
    .replace(/\b(?:dash|hyphen|minus)\b/gu, '-')
    .replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gu, (word) => spokenDigits[word])
    .replace(/\s*[-]\s*/gu, '-')
    .replace(/\s+/gu, '')
    .toUpperCase();
}

type YouTubeVideoMatch = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  watchUrl: string;
  embedUrl: string;
  durationSeconds: number | null;
  score: number;
};

type SavedYouTubeTrackMatch = {
  trackKey: string;
  videoId: string;
  videoTitle: string;
  videoUrl: string;
};

type YouTubePlayer = {
  videoId: string;
  title: string;
  watchUrl: string;
};

type MusicLibraryInfo = {
  rootPath: string | null;
  lastScannedAt: string | null;
  trackCount: number;
  scan: { status: 'idle' | 'scanning' | 'complete' | 'failed'; scannedFiles: number; indexedFiles: number; skippedFiles: number; error: string | null };
  catalogLocationScan: { status: 'idle' | 'scanning' | 'complete' | 'failed'; total: number; processed: number; matched: number; alreadyMapped: number; unmatched: number; error: string | null };
};

type PersonalTrackMatch = {
  trackKey: string;
  libraryTrack: { id: number; artist: string; album: string; title: string; trackNumber: number | null; format: string | null };
};

type LocalAudioPlayer = { trackId: number; catalogEntryId: number; title: string; subtitle: string };

type PersonalArtistFolder = { folderPath: string; name: string; trackCount: number };
type PersonalBrowsableAlbumFolder = { folderPath: string; name: string; album: string; trackCount: number };

const RESULTS_PER_PAGE = 20;
const COLLECTION_BATCH_SIZE = 50;
const STYLE_CHART_COLORS = ['#56a6d2', '#b875dd', '#e89550', '#56c49a', '#e6637d', '#d9bf53', '#7c9ee8', '#d775b7', '#78b4a2', '#d47b53'];
const MEDIA_CONDITIONS = [
  'Mint (M)',
  'Near Mint (NM or M-)',
  'Very Good Plus (VG+)',
  'Very Good (VG)',
  'Good Plus (G+)',
  'Good (G)',
  'Fair (F)',
  'Poor (P)',
];

function formatDiscogsText(text: string): string {
  return text
    .replace(/(?:â€¢|Â·)/gu, ' - ')
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '$1')
    .replace(/\[a=([^\]]+)\]/gi, '$1')
    .replace(/\[r=?([0-9]+)\]/gi, 'Discogs release #$1')
    .replace(/\[m=?([0-9]+)\]/gi, 'Discogs master #$1')
    .replace(/\[l=?([0-9]+)\]/gi, 'Discogs label #$1')
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '$2 ($1)')
    .replace(/\[\/?(?:i|u|s|quote|list|\*)\]/gi, '')
    .trim();
}

function previewDiscogsText(text: string, wordLimit = 50): string {
  const words = text.trim().split(/\s+/u);
  return words.length > wordLimit ? `${words.slice(0, wordLimit).join(' ')}…` : text;
}

function formatMusicBrainzGenre(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/(^|[\s/&-])(\p{L})/gu, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase()}`);
}

function formatDiscogsMarketPrice(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null) return 'Not available';
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
    } catch {
      // Use the readable dollar fallback when a page supplies an unfamiliar currency code.
    }
  }
  return `$${value.toFixed(2)}`;
}

function formatDiscogsMarketDate(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}

function catalogCoverUrl(entry: Pick<CdEntry, 'id' | 'coverImageUpdatedAt'>): string {
  return `/api/cds/${entry.id}/cover${entry.coverImageUpdatedAt ? `?updated=${encodeURIComponent(entry.coverImageUpdatedAt)}` : ''}`;
}

function cleanExternalSearchText(value: string): string {
  return value
    .replace(/\s*\(\d+\)(?=\s*(?:=|$))/gu, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*(?:=|\/|\||-)\s*$/u, '')
    .trim();
}

function trackKey(track: DiscogsReleaseTrack): string {
  return `${track.position || ''}|${track.title}`;
}

function trackDurationSeconds(duration: string | null): number | null {
  if (!duration) return null;
  const parts = duration.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((seconds, part) => seconds * 60 + part, 0) || null;
}

function App() {
  const [items, setItems] = useState<CdEntry[]>([]);
  const [activePage, setActivePage] = useState<'search' | 'catalog' | 'library' | 'statistics'>('search');
  const [collectionSearch, setCollectionSearch] = useState('');
  const [collectionStyle, setCollectionStyle] = useState('');
  const [collectionStyleOptions, setCollectionStyleOptions] = useState<string[]>([]);
  const [collectionSort, setCollectionSort] = useState<'artist' | 'discogs-median-desc' | 'estimated-value-desc'>('artist');
  const [collectionPage, setCollectionPage] = useState(1);
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionRefresh, setCollectionRefresh] = useState(0);
  const [collectionStatus, setCollectionStatus] = useState('');
  const [catalogStatistics, setCatalogStatistics] = useState<CatalogStatistics | null>(null);
  const [catalogStatisticsStatus, setCatalogStatisticsStatus] = useState('');
  const collectionLoadInFlightRef = useRef(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [notes, setNotes] = useState('');
  const [mediaCondition, setMediaCondition] = useState('Very Good Plus (VG+)');
  const [estimatedValueOverride, setEstimatedValueOverride] = useState('15.00');
  const [hasEstimatedValueOverride, setHasEstimatedValueOverride] = useState(false);
  const [searchArtist, setSearchArtist] = useState('');
  const [searchAlbumTitle, setSearchAlbumTitle] = useState('');
  const [searchCatalogNumber, setSearchCatalogNumber] = useState('');
  const [catalogVoiceStatus, setCatalogVoiceStatus] = useState('');
  const [catalogVoiceListening, setCatalogVoiceListening] = useState(false);
  const catalogSpeechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [searchBarcode, setSearchBarcode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState('');
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const [results, setResults] = useState<DiscogsResult[]>([]);
  const [coverImages, setCoverImages] = useState<Record<number, string | null>>({});
  const requestedCoverIds = useRef(new Set<number>());
  const searchReleaseDetailsCache = useRef(new Map<number, SearchReleaseDetailsCache>());
  const [selectedRelease, setSelectedRelease] = useState<DiscogsResult | null>(null);
  const [releaseCatalogInfoStatus, setReleaseCatalogInfoStatus] = useState('');
  const [entryBeingCorrected, setEntryBeingCorrected] = useState<CdEntry | null>(null);
  const [viewedEntry, setViewedEntry] = useState<CdEntry | null>(null);
  const [detailCoverImage, setDetailCoverImage] = useState<string | null>(null);
  const [detailContext, setDetailContext] = useState<DiscogsReleaseContext | null>(null);
  const [detailMusicBrainzContext, setDetailMusicBrainzContext] = useState<MusicBrainzCatalogContext | null>(null);
  const [detailEbayStats, setDetailEbayStats] = useState<EBayActiveListingStats | null>(null);
  const [detailStatus, setDetailStatus] = useState('');
  const [editingEstimatedValue, setEditingEstimatedValue] = useState(false);
  const [editingCatalogDetails, setEditingCatalogDetails] = useState(false);
  const [catalogDetailsForm, setCatalogDetailsForm] = useState<CatalogDetailsForm | null>(null);
  const [catalogDetailsStatus, setCatalogDetailsStatus] = useState('');
  const [estimatedValueInput, setEstimatedValueInput] = useState('');
  const [estimatedValueStatus, setEstimatedValueStatus] = useState('');
  const [detailImages, setDetailImages] = useState<DiscogsReleaseImage[]>([]);
  const [detailImagesStatus, setDetailImagesStatus] = useState('');
  const [showDetailImages, setShowDetailImages] = useState(false);
  const [detailTracks, setDetailTracks] = useState<DiscogsReleaseTrack[]>([]);
  const [detailTracksStatus, setDetailTracksStatus] = useState('');
  const [showTracklist, setShowTracklist] = useState(false);
  const [detailActionMenuOpen, setDetailActionMenuOpen] = useState(false);
  const [youTubeStatus, setYouTubeStatus] = useState('');
  const [youTubeCandidates, setYouTubeCandidates] = useState<{ track: DiscogsReleaseTrack; videos: YouTubeVideoMatch[] } | null>(null);
  const [savedYouTubeMatches, setSavedYouTubeMatches] = useState<SavedYouTubeTrackMatch[]>([]);
  const [youTubePlayer, setYouTubePlayer] = useState<YouTubePlayer | null>(null);
  const [personalTrackMatches, setPersonalTrackMatches] = useState<PersonalTrackMatch[]>([]);
  const [personalMusicStatus, setPersonalMusicStatus] = useState('');
  const [personalLocationSyncing, setPersonalLocationSyncing] = useState(false);
  const [localAudioPlayer, setLocalAudioPlayer] = useState<LocalAudioPlayer | null>(null);
  const [personalArtistFolders, setPersonalArtistFolders] = useState<PersonalArtistFolder[] | null>(null);
  const [personalBrowsableAlbumFolders, setPersonalBrowsableAlbumFolders] = useState<PersonalBrowsableAlbumFolder[] | null>(null);
  const [showPersonalFolderMapping, setShowPersonalFolderMapping] = useState(false);
  const [selectedPersonalArtistFolderPath, setSelectedPersonalArtistFolderPath] = useState('');
  const [selectedPersonalAlbumFolderPath, setSelectedPersonalAlbumFolderPath] = useState('');
  const [personalAlbumValidation, setPersonalAlbumValidation] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [personalTrackNotFoundPrompt, setPersonalTrackNotFoundPrompt] = useState<DiscogsReleaseTrack | null>(null);
  const [personalAlbumMappingStatus, setPersonalAlbumMappingStatus] = useState('');
  const [musicLibrary, setMusicLibrary] = useState<MusicLibraryInfo | null>(null);
  const [musicLibraryPath, setMusicLibraryPath] = useState('H:\\Music\\Rips');
  const [musicLibraryStatus, setMusicLibraryStatus] = useState('');
  const [savingMusicLibrary, setSavingMusicLibrary] = useState(false);
  const [catalogSaveAction, setCatalogSaveAction] = useState<string | null>(null);
  const [catalogSaveError, setCatalogSaveError] = useState<string | null>(null);
  const catalogSaveInFlightRef = useRef(false);
  const [marketStatsBackfill, setMarketStatsBackfill] = useState<MarketStatsBackfill | null>(null);
  const [marketStatsBackfillStatus, setMarketStatsBackfillStatus] = useState('');
  const [discogsCollectionSync, setDiscogsCollectionSync] = useState<DiscogsCollectionSyncInfo | null>(null);
  const [discogsCollectionSyncStatus, setDiscogsCollectionSyncStatus] = useState('');
  const [ebayListingStats, setEbayListingStats] = useState<EBayActiveListingStats | null>(null);
  const [ebayListingStatus, setEbayListingStatus] = useState('');
  const [includeEbayAuctionValues, setIncludeEbayAuctionValues] = useState(true);
  const [discogsSearchMarketStats, setDiscogsSearchMarketStats] = useState<DiscogsMarketStats | null>(null);
  const [discogsSearchMarketStatsStatus, setDiscogsSearchMarketStatsStatus] = useState('');
  const [includeDiscogsMarketStats, setIncludeDiscogsMarketStats] = useState(true);
  const [releaseContext, setReleaseContext] = useState<DiscogsReleaseContext | null>(null);
  const [releaseContextStatus, setReleaseContextStatus] = useState('');
  const [expandedArtistSummary, setExpandedArtistSummary] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [resultCountryFilter, setResultCountryFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const addCardRef = useRef<HTMLDivElement>(null);
  const selectedReleasePanelRef = useRef<HTMLElement>(null);

  function openSelectedReleaseEditor() {
    selectedReleasePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    let cancelled = false;
    setCollectionLoading(true);
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(collectionPage), pageSize: String(COLLECTION_BATCH_SIZE) });
      if (collectionSearch.trim()) params.set('q', collectionSearch.trim());
      if (collectionStyle) params.set('style', collectionStyle);
      params.set('sort', collectionSort);
      fetch(`/api/cds?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { items?: CdEntry[]; total?: number }) => {
          if (cancelled) return;
          const nextItems = data.items ?? [];
          setItems((current) => collectionPage === 1 ? nextItems : [
            ...current,
            ...nextItems.filter((nextItem) => !current.some((item) => item.id === nextItem.id)),
          ]);
          setCollectionTotal(data.total ?? 0);
        })
        .catch(() => {
          if (!cancelled && collectionPage === 1) {
            setItems([]);
            setCollectionTotal(0);
          }
        })
        .finally(() => {
          if (!cancelled) {
            collectionLoadInFlightRef.current = false;
            setCollectionLoading(false);
          }
        });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [collectionPage, collectionRefresh, collectionSearch, collectionSort, collectionStyle]);

  useEffect(() => {
    if (activePage !== 'catalog') return;
    let cancelled = false;
    fetch('/api/catalog/styles')
      .then((response) => response.ok ? response.json() as Promise<{ styles?: string[] }> : { styles: [] })
      .then((data) => { if (!cancelled) setCollectionStyleOptions(data.styles ?? []); })
      .catch(() => { if (!cancelled) setCollectionStyleOptions([]); });
    return () => { cancelled = true; };
  }, [activePage]);

  useEffect(() => {
    if (activePage !== 'statistics') return;
    let cancelled = false;
    fetch('/api/catalog/statistics')
      .then((response) => response.json())
      .then((data: CatalogStatistics) => { if (!cancelled) setCatalogStatistics(data); })
      .catch(() => { if (!cancelled) setCatalogStatisticsStatus('Unable to load catalog statistics.'); });
    return () => { cancelled = true; };
  }, [activePage, collectionRefresh]);

  useEffect(() => {
    if (activePage !== 'library') return;
    let cancelled = false;
    const loadLibrary = async () => {
      try {
        const response = await fetch('/api/music-library');
        const data = await response.json() as MusicLibraryInfo;
        if (!cancelled) {
          setMusicLibrary(data);
          setMusicLibraryPath((current) => current === 'H:\\Music\\Rips' && data.rootPath ? data.rootPath : current);
        }
      } catch {
        if (!cancelled) setMusicLibraryStatus('Unable to load the local music-library settings.');
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
    void loadLibrary();
    void loadMarketStatsBackfill();
    void loadDiscogsCollectionSync();
    const interval = window.setInterval(() => { void loadLibrary(); void loadMarketStatsBackfill(); void loadDiscogsCollectionSync(); }, 1500);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [activePage]);

  const searchSummary = useMemo(() => {
    const description = [
      [searchArtist.trim(), searchAlbumTitle.trim()].filter(Boolean).join(' — '),
      searchCatalogNumber.trim() ? `Catalog # ${searchCatalogNumber.trim()}` : '',
      searchBarcode.trim() ? `Barcode ${searchBarcode.trim()}` : '',
    ].filter(Boolean).join(' | ');
    if (!description) return 'Enter an artist and album title to look up Discogs releases.';
    if (!hasSearched) return `Search Discogs for “${description}”.`;
    if (results.length === 0) return `No Discogs matches found for “${description}”.`;
    return `Showing ${results.length} Discogs ${results.length === 1 ? 'match' : 'matches'} for “${description}”.`;
  }, [hasSearched, results.length, searchAlbumTitle, searchArtist, searchBarcode, searchCatalogNumber]);

  const availableResultCountries = useMemo(() => Array.from(new Set(
    results.map((result) => result.country?.trim()).filter((country): country is string => Boolean(country)),
  )).sort((left, right) => left.localeCompare(right)), [results]);
  const filteredResults = useMemo(() => resultCountryFilter
    ? results.filter((result) => result.country?.trim() === resultCountryFilter)
    : results, [resultCountryFilter, results]);
  const totalPages = Math.ceil(filteredResults.length / RESULTS_PER_PAGE);
  const visibleResults = useMemo(() => {
    const start = (currentPage - 1) * RESULTS_PER_PAGE;
    return filteredResults.slice(start, start + RESULTS_PER_PAGE);
  }, [currentPage, filteredResults]);
  const hasMoreCollectionItems = items.length < collectionTotal;

  useEffect(() => {
    const releasesNeedingCovers = visibleResults.filter(
      (release) => !release.coverImage && !release.thumb && !requestedCoverIds.current.has(release.id),
    );

    if (releasesNeedingCovers.length === 0) return;

    releasesNeedingCovers.forEach((release) => requestedCoverIds.current.add(release.id));
    void Promise.all(releasesNeedingCovers.map(async (release) => {
      try {
        const response = await fetch(`/api/discogs/releases/${release.id}/cover`);
        const data = await response.json() as { coverImage?: string | null };
        setCoverImages((current) => ({ ...current, [release.id]: data.coverImage ?? null }));
      } catch {
        setCoverImages((current) => ({ ...current, [release.id]: null }));
      }
    }));
  }, [visibleResults]);

  useEffect(() => {
    if (!selectedRelease) {
      setReleaseContext(null);
      setReleaseContextStatus('');
      return;
    }

    const cached = searchReleaseDetailsCache.current.get(selectedRelease.id)?.context;
    if (cached) {
      setReleaseContext(cached);
      setReleaseContextStatus('');
      return;
    }

    let cancelled = false;
    setReleaseContext(null);
    setReleaseContextStatus('Loading Discogs artist and release information...');

    void fetch(`/api/discogs/releases/${selectedRelease.id}/context`)
      .then(async (response) => {
        const data = await response.json() as DiscogsReleaseContext & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load Discogs artist and release information.');
        return data;
      })
      .then((context) => {
        if (!cancelled) {
          const existing = searchReleaseDetailsCache.current.get(selectedRelease.id);
          if (existing) existing.context = context;
          else searchReleaseDetailsCache.current.set(selectedRelease.id, { release: selectedRelease, context });
          setReleaseContext(context);
          setReleaseContextStatus('');
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setReleaseContextStatus(error instanceof Error ? error.message : 'Unable to load Discogs artist and release information.');
      });

    return () => { cancelled = true; };
  }, [selectedRelease]);

  useEffect(() => {
    if (!viewedEntry) {
      setDetailCoverImage(null);
      setDetailContext(null);
      setDetailMusicBrainzContext(null);
      setDetailEbayStats(null);
      setDetailStatus('');
      setEditingEstimatedValue(false);
      setEstimatedValueInput('');
      setEstimatedValueStatus('');
      setEditingCatalogDetails(false);
      setCatalogDetailsForm(null);
      setCatalogDetailsStatus('');
      setDetailImages([]);
      setDetailImagesStatus('');
      setShowDetailImages(false);
      setDetailTracks([]);
      setDetailTracksStatus('');
      setShowTracklist(false);
      setDetailActionMenuOpen(false);
      setYouTubeStatus('');
      setYouTubeCandidates(null);
      setSavedYouTubeMatches([]);
      setYouTubePlayer(null);
      setPersonalTrackMatches([]);
      setPersonalMusicStatus('');
      setPersonalArtistFolders(null);
      setPersonalBrowsableAlbumFolders(null);
      setShowPersonalFolderMapping(false);
      setPersonalTrackNotFoundPrompt(null);
      setSelectedPersonalArtistFolderPath('');
      setSelectedPersonalAlbumFolderPath('');
      setPersonalAlbumValidation('idle');
      setPersonalAlbumMappingStatus('');
      return;
    }

    let cancelled = false;
    setDetailCoverImage(null);
    setDetailContext(null);
    setDetailMusicBrainzContext(null);
    setDetailEbayStats(null);
    setDetailStatus('Loading live Discogs, MusicBrainz, and eBay details...');
    setEditingEstimatedValue(false);
    setEstimatedValueInput('');
    setEstimatedValueStatus('');
    setEditingCatalogDetails(false);
    setCatalogDetailsForm(null);
    setCatalogDetailsStatus('');
    setDetailImages([]);
    setDetailImagesStatus('');
    setShowDetailImages(false);
    setDetailTracks([]);
    setDetailTracksStatus('');
    setPersonalArtistFolders(null);
    setPersonalBrowsableAlbumFolders(null);
    setShowPersonalFolderMapping(false);
    setPersonalTrackNotFoundPrompt(null);
    setSelectedPersonalArtistFolderPath('');
    setSelectedPersonalAlbumFolderPath('');
    setPersonalAlbumValidation('idle');
    setPersonalAlbumMappingStatus('');
    setShowTracklist(false);
    setYouTubeStatus('');
    setYouTubeCandidates(null);
    setSavedYouTubeMatches([]);
    setYouTubePlayer(null);
    setPersonalTrackMatches([]);
    setPersonalMusicStatus('');

    const lookups: Promise<void>[] = [];
    if (viewedEntry.artistSummary || viewedEntry.discogsNotes) {
      setDetailContext({
        artistProfile: viewedEntry.artistSummary ?? null,
        description: viewedEntry.discogsNotes ?? null,
        descriptionSource: viewedEntry.discogsNotesSource ?? null,
        genre: viewedEntry.genre ?? null,
        style: viewedEntry.style ?? null,
      });
    }
    if (viewedEntry.hasCover) {
      setDetailCoverImage(catalogCoverUrl(viewedEntry));
    }
    if (viewedEntry.discogsId) {
      lookups.push(
        fetch(`/api/discogs/releases/${viewedEntry.discogsId}/context?cdEntryId=${viewedEntry.id}`)
          .then((response) => response.json() as Promise<DiscogsReleaseContext>)
          .then((data) => { if (!cancelled) setDetailContext(data); })
          .catch(() => undefined),
      );
      if (!viewedEntry.hasCover) {
        lookups.push(
          fetch(`/api/discogs/releases/${viewedEntry.discogsId}/cover`)
            .then((response) => response.json() as Promise<{ coverImage?: string | null }>)
            .then((data) => { if (!cancelled) setDetailCoverImage(data.coverImage ?? null); })
            .catch(() => undefined),
        );
      }
    }
    lookups.push(
      fetch(`/api/musicbrainz/context?${new URLSearchParams({ artist: viewedEntry.artist, album: viewedEntry.title }).toString()}`)
        .then((response) => response.ok ? response.json() as Promise<MusicBrainzCatalogContext> : null)
        .then((data) => { if (!cancelled && data) setDetailMusicBrainzContext(data); })
        .catch(() => undefined),
    );

    const ebayParams = new URLSearchParams({ artist: viewedEntry.artist, title: viewedEntry.title });
    if (viewedEntry.catalogNumber) ebayParams.set('catalogNumber', viewedEntry.catalogNumber);
    lookups.push(
      fetch(`/api/ebay/active-listing-stats?${ebayParams.toString()}`)
        .then((response) => response.ok ? response.json() as Promise<EBayActiveListingStats> : null)
        .then((data) => { if (!cancelled && data) setDetailEbayStats(data); })
        .catch(() => undefined),
    );

    void Promise.allSettled(lookups).then(() => {
      if (!cancelled) setDetailStatus('');
    });
    return () => { cancelled = true; };
  }, [viewedEntry]);

  useEffect(() => {
    if (!viewedEntry) return;
    let cancelled = false;
    void fetch(`/api/cds/${viewedEntry.id}/youtube-track-matches`)
      .then((response) => response.ok ? response.json() as Promise<{ matches?: SavedYouTubeTrackMatch[] }> : { matches: [] })
      .then((data) => { if (!cancelled) setSavedYouTubeMatches(data.matches ?? []); })
      .catch(() => { if (!cancelled) setSavedYouTubeMatches([]); });
    return () => { cancelled = true; };
  }, [viewedEntry]);

  useEffect(() => {
    if (!viewedEntry) return;
    let cancelled = false;
    void fetch(`/api/cds/${viewedEntry.id}/personal-track-matches`)
      .then((response) => response.ok ? response.json() as Promise<{ matches?: PersonalTrackMatch[] }> : { matches: [] })
      .then((data) => { if (!cancelled) setPersonalTrackMatches(data.matches ?? []); })
      .catch(() => { if (!cancelled) setPersonalTrackMatches([]); });
    return () => { cancelled = true; };
  }, [viewedEntry]);

  useEffect(() => {
    if (!selectedRelease || !includeEbayAuctionValues) {
      setEbayListingStats(null);
      setEbayListingStatus('');
      return;
    }

    const cached = searchReleaseDetailsCache.current.get(selectedRelease.id)?.ebay;
    if (cached) {
      setEbayListingStats(cached.stats);
      setEbayListingStatus(cached.status);
      return;
    }

    let cancelled = false;
    setEbayListingStats(null);
    setEbayListingStatus('Loading current eBay listings...');
    const params = new URLSearchParams({ artist: selectedRelease.artist, title: selectedRelease.title });
    if (selectedRelease.catalogNumber) params.set('catalogNumber', selectedRelease.catalogNumber);

    void fetch(`/api/ebay/active-listing-stats?${params.toString()}`)
      .then(async (response) => {
        const data = await response.json() as EBayActiveListingStats & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load eBay listings.');
        return data;
      })
      .then((stats) => {
        if (cancelled) return;
        const ebayStatus = stats.sampledListingCount
          ? ''
          : 'No priced active eBay listings were returned for this search.';
        const existing = searchReleaseDetailsCache.current.get(selectedRelease.id);
        if (existing) existing.ebay = { stats, status: ebayStatus };
        else searchReleaseDetailsCache.current.set(selectedRelease.id, { release: selectedRelease, ebay: { stats, status: ebayStatus } });
        setEbayListingStats(stats);
        setEbayListingStatus(ebayStatus);
      })
      .catch((error: unknown) => {
        if (!cancelled) setEbayListingStatus(error instanceof Error ? error.message : 'Unable to load eBay listings.');
      });

    return () => { cancelled = true; };
  }, [includeEbayAuctionValues, selectedRelease]);

  useEffect(() => {
    if (!selectedRelease || !includeDiscogsMarketStats) {
      setDiscogsSearchMarketStats(null);
      setDiscogsSearchMarketStatsStatus('');
      return;
    }

    const cached = searchReleaseDetailsCache.current.get(selectedRelease.id)?.marketStats;
    if (cached) {
      setDiscogsSearchMarketStats(cached.stats);
      setDiscogsSearchMarketStatsStatus(cached.status);
      return;
    }

    let cancelled = false;
    setDiscogsSearchMarketStats(null);
    setDiscogsSearchMarketStatsStatus('Loading Discogs market statistics...');
    void fetch(`/api/discogs/releases/${selectedRelease.id}/market-stats`)
      .then(async (response) => {
        const data = await response.json() as DiscogsMarketStats & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load Discogs market statistics.');
        return data;
      })
      .then((stats) => {
        if (cancelled) return;
        const marketStatsStatus = stats.low == null && stats.median == null && stats.high == null
          ? 'No recent Discogs sale detail found.'
          : '';
        const existing = searchReleaseDetailsCache.current.get(selectedRelease.id);
        if (existing) existing.marketStats = { stats, status: marketStatsStatus };
        else searchReleaseDetailsCache.current.set(selectedRelease.id, { release: selectedRelease, marketStats: { stats, status: marketStatsStatus } });
        setDiscogsSearchMarketStats(stats);
        setDiscogsSearchMarketStatsStatus(marketStatsStatus);
      })
      .catch((error: unknown) => {
        if (!cancelled) setDiscogsSearchMarketStatsStatus(error instanceof Error ? error.message : 'Unable to load Discogs market statistics.');
      });
    return () => { cancelled = true; };
  }, [includeDiscogsMarketStats, selectedRelease]);

  function startCatalogNumberVoiceEntry() {
    const voiceWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setCatalogVoiceStatus('Voice entry is not available in this browser. Try Chrome or Safari with microphone permission enabled.');
      return;
    }
    catalogSpeechRecognitionRef.current?.abort();
    const recognition = new Recognition();
    catalogSpeechRecognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      const catalogNumber = normalizeSpokenCatalogNumber(transcript);
      if (!catalogNumber) {
        setCatalogVoiceStatus('No catalog number was heard. Please try again.');
        return;
      }
      setSearchCatalogNumber(catalogNumber);
      setHasSearched(false);
      setCurrentPage(1);
      setCatalogVoiceStatus(`Heard: ${catalogNumber}`);
    };
    recognition.onerror = (event) => {
      setCatalogVoiceStatus(event.error === 'not-allowed'
        ? 'Microphone permission was not granted.'
        : `Voice entry could not start (${event.error}).`);
    };
    recognition.onend = () => {
      setCatalogVoiceListening(false);
      catalogSpeechRecognitionRef.current = null;
    };
    setCatalogVoiceListening(true);
    setCatalogVoiceStatus('Listening for a catalog number...');
    try {
      recognition.start();
    } catch {
      setCatalogVoiceListening(false);
      catalogSpeechRecognitionRef.current = null;
      setCatalogVoiceStatus('Voice entry is already active or could not start. Please try again.');
    }
  }

  function stopCatalogNumberVoiceEntry() {
    const recognition = catalogSpeechRecognitionRef.current;
    catalogSpeechRecognitionRef.current = null;
    setCatalogVoiceListening(false);
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        // Recognition may already have finished between the user action and this call.
      }
    }
  }

  useEffect(() => {
    if (activePage !== 'search') stopCatalogNumberVoiceEntry();
  }, [activePage]);

  useEffect(() => () => stopCatalogNumberVoiceEntry(), []);

  async function handleSearch(scannedBarcode?: string) {
    const searchArtistValue = searchArtist.trim();
    const searchAlbumTitleValue = searchAlbumTitle.trim();
    const searchCatalogNumberValue = searchCatalogNumber.trim();
    const searchBarcodeValue = scannedBarcode ?? searchBarcode.trim();
    if (!searchArtistValue && !searchAlbumTitleValue && !searchCatalogNumberValue && !searchBarcodeValue) return;

    setLoading(true);
    setHasSearched(true);
    setCurrentPage(1);
    setResultCountryFilter('');
    setStatus('Searching Discogs...');

    try {
      const params = new URLSearchParams();
      if (searchArtistValue) params.set('artist', searchArtistValue);
      if (searchAlbumTitleValue) params.set('title', searchAlbumTitleValue);
      if (searchCatalogNumberValue) params.set('catno', searchCatalogNumberValue);
      if (searchBarcodeValue) params.set('barcode', searchBarcodeValue);
      const res = await fetch(`/api/discogs/search?${params.toString()}`);
      const data = await res.json();
      const normalizedResults = (Array.isArray(data) ? data : [])
        .sort((left: DiscogsResult, right: DiscogsResult) => {
          if (left.year == null && right.year == null) return 0;
          if (left.year == null) return 1;
          if (right.year == null) return -1;
          return left.year - right.year;
        });
      setResults(normalizedResults);
      setCoverImages({});
      requestedCoverIds.current.clear();
      searchReleaseDetailsCache.current.clear();
      setSelectedRelease(null);
      setReleaseCatalogInfoStatus('');
      setStatus(normalizedResults.length > 0 ? 'Choose the version you own.' : 'No matches found.');
    } catch {
      setResults([]);
      setSelectedRelease(null);
      setReleaseCatalogInfoStatus('');
      setStatus('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    stopCatalogNumberVoiceEntry();
    setSearchArtist('');
    setSearchAlbumTitle('');
    setSearchCatalogNumber('');
    setSearchBarcode('');
    setResults([]);
    setCoverImages({});
    requestedCoverIds.current.clear();
    searchReleaseDetailsCache.current.clear();
    setSelectedRelease(null);
    setReleaseCatalogInfoStatus('');
    setReleaseContext(null);
    setReleaseContextStatus('');
    setEbayListingStats(null);
    setEbayListingStatus('');
    setResultCountryFilter('');
    setHasSearched(false);
    setCurrentPage(1);
    setStatus('Search cleared.');
  }

  async function selectSearchResult(release: DiscogsResult) {
    if (selectedRelease?.id === release.id) return;
    setExpandedArtistSummary(null);

    const cached = searchReleaseDetailsCache.current.get(release.id);
    if (cached?.catalogInfoLoaded) {
      setSelectedRelease(cached.release);
      setReleaseCatalogInfoStatus('Release-specific label, catalog number, and barcode loaded from this search.');
      return;
    }

    setSelectedRelease(release);
    setReleaseCatalogInfoStatus('Loading release-specific label, catalog number, and barcode...');

    try {
      const response = await fetch(`/api/discogs/releases/${release.id}/catalog-info`);
      const data = await response.json() as { label?: string | null; catalogNumber?: string | null; barcode?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load release-specific information.');

      const enrichedRelease = {
        ...release,
        label: data.label ?? release.label,
        catalogNumber: data.catalogNumber ?? release.catalogNumber,
        barcode: data.barcode ?? null,
      };
      setResults((current) => current.map((item) => item.id === release.id ? enrichedRelease : item));
      const cachedRelease = searchReleaseDetailsCache.current.get(release.id);
      if (cachedRelease) {
        cachedRelease.release = enrichedRelease;
        cachedRelease.catalogInfoLoaded = true;
      } else {
        searchReleaseDetailsCache.current.set(release.id, { release: enrichedRelease, catalogInfoLoaded: true });
      }
      setSelectedRelease((current) => current?.id === release.id ? enrichedRelease : current);
      setReleaseCatalogInfoStatus('Release-specific label, catalog number, and barcode loaded.');
    } catch (error) {
      setReleaseCatalogInfoStatus(error instanceof Error
        ? `${error.message} Showing the search-result details instead.`
        : 'Unable to load release-specific information. Showing the search-result details instead.');
    }
  }

  useEffect(() => {
    if (!scannerOpen) return;

    let cancelled = false;
    let stopScanner: (() => void) | undefined;

    async function startScanner() {
      if (!window.isSecureContext) {
        setScannerStatus('Camera scanning requires HTTPS.');
        return;
      }

      try {
        const localAudio = document.querySelector<HTMLAudioElement>('.local-audio-player audio');
        const localAudioWasPlaying = Boolean(localAudio && !localAudio.paused && !localAudio.ended);
        const video = scannerVideoRef.current;
        if (!video) {
          return;
        }

        const reader = new BrowserMultiFormatReader();
        reader.possibleFormats = [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
        ];
        setScannerStatus('Point the camera at the barcode.');

        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          video,
          (result) => {
            const barcode = result?.getText().trim();
            if (cancelled || !barcode) return;

            controls.stop();
            setSearchBarcode(barcode);
            setHasSearched(false);
            setCurrentPage(1);
            setScannerOpen(false);
            void handleSearch(barcode);
          },
        );
        stopScanner = () => controls.stop();
        if (localAudioWasPlaying && localAudio?.paused) {
          try {
            await localAudio.play();
          } catch {
            // iPhone browsers may reject this when their camera audio session
            // takes priority. The persistent player remains available to resume.
            setScannerStatus('Camera is ready. If iPhone paused playback, tap Play in the player to resume.');
          }
        }
      } catch {
        setScannerStatus('Unable to open the camera. Check the browser camera permission.');
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      stopScanner?.();
    };
  }, [scannerOpen]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (catalogSaveInFlightRef.current) return;
    if (entryBeingCorrected && !selectedRelease) {
      setStatus('Select the correct Discogs release before applying this correction.');
      return;
    }

    const payload = {
      title: selectedRelease?.title || title,
      artist: selectedRelease?.artist || artist,
      year: selectedRelease?.year ?? null,
      country: selectedRelease?.country ?? null,
      label: selectedRelease?.label ?? null,
      format: selectedRelease?.format || null,
      discogsId: selectedRelease?.id ?? null,
      discogsUri: selectedRelease?.uri || null,
      catalogNumber: selectedRelease?.catalogNumber ?? null,
      barcode: selectedRelease?.barcode ?? null,
      mediaCondition: mediaCondition || null,
      estimatedValueOverride: hasEstimatedValueOverride && estimatedValueOverride.trim() ? Number(estimatedValueOverride) : null,
      notes,
    };

    catalogSaveInFlightRef.current = true;
    setCatalogSaveAction('Saving catalog entry…');
    try {
      const res = await fetch(entryBeingCorrected ? `/api/cds/${entryBeingCorrected.id}` : '/api/cds', {
        method: entryBeingCorrected ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        setItems((prev) => entryBeingCorrected
          ? prev.map((item) => item.id === created.id ? created : item)
          : [created, ...prev]);
        setTitle('');
        setArtist('');
        setNotes('');
        setMediaCondition('Very Good Plus (VG+)');
        setEstimatedValueOverride('15.00');
        setHasEstimatedValueOverride(false);
        setSearchArtist('');
        setSearchAlbumTitle('');
        setSearchCatalogNumber('');
        setSearchBarcode('');
        setResults([]);
        setSelectedRelease(null);
        setReleaseCatalogInfoStatus('');
        const wasCorrection = Boolean(entryBeingCorrected);
        setEntryBeingCorrected(null);
        setCollectionRefresh((current) => current + 1);
        setStatus(wasCorrection
          ? (created.estimatedValue != null ? 'Discogs match corrected with a refreshed value.' : 'Discogs match corrected. The old valuation was cleared.')
          : (created.estimatedValue != null ? 'CD saved with a fresh Discogs value.' : 'CD saved locally.'));
      } else {
        const error = await res.json().catch(() => ({ error: 'Unable to save this CD.' }));
        const message = error.error || 'Unable to save this CD.';
        setStatus(message);
        setCatalogSaveError(message);
      }
    } catch {
      const message = 'Unable to save this CD. Please try again.';
      setStatus(message);
      setCatalogSaveError(message);
    } finally {
      catalogSaveInFlightRef.current = false;
      setCatalogSaveAction(null);
    }
  }

  function beginMatchCorrection(item: CdEntry) {
    setViewedEntry(null);
    setActivePage('search');
    setEntryBeingCorrected(item);
    setTitle(item.title);
    setArtist(item.artist);
    setNotes(item.notes || '');
    setMediaCondition(item.mediaCondition || 'Very Good Plus (VG+)');
    setEstimatedValueOverride('15.00');
    setHasEstimatedValueOverride(false);
    setSearchArtist(item.artist);
    setSearchAlbumTitle(item.title);
    setSearchCatalogNumber('');
    setSearchBarcode('');
    setResults([]);
    setSelectedRelease(null);
    setReleaseCatalogInfoStatus('');
    setHasSearched(false);
    setCurrentPage(1);
    setStatus('Search again, select the correct Discogs release, then apply the correction.');
    window.setTimeout(() => addCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function cancelMatchCorrection() {
    setEntryBeingCorrected(null);
    setSelectedRelease(null);
    setReleaseCatalogInfoStatus('');
    setResults([]);
    setStatus('Match correction cancelled.');
  }

  async function openEbaySearch(item: CdEntry) {
    setCollectionStatus('Finding the best matching eBay search...');
    let searchMethod: EBayActiveListingStats['searchMethod'] = item.catalogNumber?.trim()
      ? 'catalogNumber'
      : 'artistTitle';
    try {
      const params = new URLSearchParams({ artist: item.artist, title: item.title });
      if (item.catalogNumber) params.set('catalogNumber', item.catalogNumber);
      const response = await fetch(`/api/ebay/active-listing-stats?${params.toString()}`);
      if (response.ok) {
        const stats = await response.json() as EBayActiveListingStats;
        searchMethod = stats.searchMethod;
      }
    } catch {
      // If eBay is temporarily unavailable, retain the catalog-number-first default.
    }

    const searchTerms = searchMethod === 'catalogNumber' && item.catalogNumber?.trim()
      ? item.catalogNumber.trim()
      : [cleanExternalSearchText(item.artist), cleanExternalSearchText(item.title), 'CD'].filter(Boolean).join(' ');
    const searchUrl = new URL('https://www.ebay.com/sch/i.html');
    searchUrl.searchParams.set('_nkw', searchTerms);
    searchUrl.searchParams.set('_sacat', '176984');
    window.open(searchUrl.toString(), '_blank', 'noopener,noreferrer');
    setCollectionStatus(searchMethod === 'catalogNumber'
      ? 'Opened eBay using the catalog number match.'
      : 'Opened eBay using the artist and album fallback match.');
  }

  async function removeCatalogEntry(item: CdEntry) {
    const confirmed = window.confirm(`Remove “${item.artist} — ${item.title}” from your local catalog? This does not remove anything from Discogs.`);
    if (!confirmed) return;

    setCollectionStatus('Removing catalog entry...');
    try {
      const response = await fetch(`/api/cds/${item.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unable to remove this catalog entry.' }));
        throw new Error(data.error || 'Unable to remove this catalog entry.');
      }
      if (viewedEntry?.id === item.id) setViewedEntry(null);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setCollectionTotal((current) => Math.max(0, current - 1));
      setCollectionRefresh((current) => current + 1);
      setCollectionStatus('Catalog entry removed.');
    } catch (error) {
      setCollectionStatus(error instanceof Error ? error.message : 'Unable to remove this catalog entry.');
    }
  }

  async function loadDetailImages() {
    if (!viewedEntry?.discogsId) {
      setDetailImagesStatus('This catalog entry does not have a Discogs release to load images from.');
      return;
    }
    if (showDetailImages) {
      setShowDetailImages(false);
      return;
    }
    setShowDetailImages(true);
    if (detailImages.length) return;
    setDetailImagesStatus('Loading Discogs release images...');
    try {
      const response = await fetch(`/api/discogs/releases/${viewedEntry.discogsId}/images`);
      const data = await response.json() as { images?: DiscogsReleaseImage[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load release images.');
      setDetailImages(data.images ?? []);
      setDetailImagesStatus(data.images?.length ? '' : 'Discogs does not provide additional images for this release.');
    } catch (error) {
      setDetailImagesStatus(error instanceof Error ? error.message : 'Unable to load release images.');
    }
  }

  function openDiscogsRelease(item: CdEntry) {
    const url = item.discogsUri
      ? `https://www.discogs.com${item.discogsUri}`
      : item.discogsId ? `https://www.discogs.com/release/${item.discogsId}` : null;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openDiscogsMarketplace(item: CdEntry) {
    if (!item.discogsId) {
      setCollectionStatus('This catalog entry does not have a Discogs release to search.');
      return;
    }
    window.open(`https://www.discogs.com/sell/release/${item.discogsId}`, '_blank', 'noopener,noreferrer');
  }

  async function openTracklist() {
    if (!viewedEntry?.discogsId) {
      setDetailTracksStatus('This catalog entry does not have a Discogs release to load a tracklist from.');
      return;
    }
    setShowTracklist(true);
    if (detailTracks.length) return;
    setDetailTracksStatus('Loading Discogs tracklist...');
    try {
      const response = await fetch(`/api/discogs/releases/${viewedEntry.discogsId}/tracklist`);
      const data = await response.json() as { tracks?: DiscogsReleaseTrack[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load the tracklist.');
      setDetailTracks(data.tracks ?? []);
      setDetailTracksStatus(data.tracks?.length ? '' : 'Discogs does not provide a tracklist for this release.');
    } catch (error) {
      setDetailTracksStatus(error instanceof Error ? error.message : 'Unable to load the tracklist.');
    }
  }

  function openTrackOnYouTube(track: DiscogsReleaseTrack) {
    if (!viewedEntry) return;
    const query = [cleanExternalSearchText(viewedEntry.artist), cleanExternalSearchText(viewedEntry.title), cleanExternalSearchText(track.title)].filter(Boolean).join(' ');
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
  }

  async function findYouTubeMatches(track: DiscogsReleaseTrack) {
    if (!viewedEntry) return;
    setYouTubeCandidates(null);
    setYouTubeStatus(`Finding YouTube matches for “${track.title}”...`);
    try {
      const params = new URLSearchParams({
        artist: cleanExternalSearchText(viewedEntry.artist),
        album: cleanExternalSearchText(viewedEntry.title),
        track: cleanExternalSearchText(track.title),
      });
      const duration = trackDurationSeconds(track.duration);
      if (duration) params.set('durationSeconds', String(duration));
      const response = await fetch(`/api/youtube/best-match?${params.toString()}`);
      const data = await response.json() as { videos?: YouTubeVideoMatch[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to find YouTube matches.');
      if (!data.videos?.length) {
        setYouTubeStatus('No good YouTube candidates were returned for this track. Use Search instead.');
        return;
      }
      setYouTubeCandidates({ track, videos: data.videos });
      setYouTubeStatus('Choose the correct match. Your selection will be remembered for this track.');
    } catch (error) {
      setYouTubeStatus(error instanceof Error ? error.message : 'Unable to find a YouTube match.');
    }
  }

  async function chooseYouTubeMatch(track: DiscogsReleaseTrack, video: YouTubeVideoMatch) {
    if (!viewedEntry) return;
    try {
      const response = await fetch(`/api/cds/${viewedEntry.id}/youtube-track-matches`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackKey: trackKey(track), videoId: video.videoId, videoTitle: video.title, videoUrl: video.watchUrl }),
      });
      const saved = await response.json() as SavedYouTubeTrackMatch & { error?: string };
      if (!response.ok) throw new Error(saved.error || 'Unable to save this YouTube match.');
      setSavedYouTubeMatches((current) => [...current.filter((match) => match.trackKey !== saved.trackKey), saved]);
      setYouTubeCandidates(null);
      setYouTubeStatus(`Saved match: ${video.title}`);
      setLocalAudioPlayer(null);
      setYouTubePlayer({ videoId: video.videoId, title: video.title, watchUrl: video.watchUrl });
    } catch (error) {
      setYouTubeStatus(error instanceof Error ? error.message : 'Unable to save this YouTube match.');
    }
  }

  async function saveMusicLibrary() {
    setSavingMusicLibrary(true);
    setMusicLibraryStatus('Saving music-library folder...');
    try {
      const response = await fetch('/api/music-library', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath: musicLibraryPath }),
      });
      const data = await response.json() as { rootPath?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to save the music-library folder.');
      setMusicLibrary((current) => current ? { ...current, rootPath: data.rootPath ?? null, lastScannedAt: null, trackCount: 0 } : current);
      setMusicLibraryStatus('Music-library folder saved. Scan it to make your tracks available.');
    } catch (error) {
      setMusicLibraryStatus(error instanceof Error ? error.message : 'Unable to save the music-library folder.');
    } finally {
      setSavingMusicLibrary(false);
    }
  }

  async function scanMusicLibrary() {
    setMusicLibraryStatus('Starting music-library scan...');
    try {
      const response = await fetch('/api/music-library/scan', { method: 'POST' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to start the music-library scan.');
      setMusicLibraryStatus('Scanning your tagged music files. You can leave this page while it runs.');
    } catch (error) {
      setMusicLibraryStatus(error instanceof Error ? error.message : 'Unable to start the music-library scan.');
    }
  }

  async function findPersonalCopy(track: DiscogsReleaseTrack) {
    if (!viewedEntry) return;
    setPersonalMusicStatus(`Looking for “${track.title}” in your personal music library...`);
    try {
      const params = new URLSearchParams({ cdEntryId: String(viewedEntry.id), trackKey: trackKey(track), trackTitle: track.title });
      const response = await fetch(`/api/music-library/matches/find?${params.toString()}`);
      const data = await response.json() as { status?: 'matched' | 'notFound' | 'unindexed'; match?: PersonalTrackMatch | null; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to search the personal music library.');
      if (data.status === 'matched' && data.match) {
        setShowPersonalFolderMapping(false);
        setPersonalTrackMatches((current) => [...current.filter((match) => match.trackKey !== data.match!.trackKey), data.match!]);
        playLocalCopy(data.match);
        setPersonalMusicStatus(`Found your local copy of “${track.title}”.`);
      } else if (data.status === 'unindexed') {
        setPersonalMusicStatus('Your music library has not been scanned yet. Open Music Library in the left navigation and choose Scan library.');
      } else {
        setPersonalMusicStatus(`No tagged local copy of “${track.title}” was found.`);
        setPersonalTrackNotFoundPrompt(track);
      }
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to search the personal music library.');
    }
  }

  function playLocalCopy(match: PersonalTrackMatch) {
    if (!viewedEntry) return;
    setYouTubePlayer(null);
    setLocalAudioPlayer({ trackId: match.libraryTrack.id, catalogEntryId: viewedEntry.id, title: match.libraryTrack.title, subtitle: `${match.libraryTrack.artist} — ${match.libraryTrack.album}` });
  }

  async function playNextLocalCopy() {
    const currentPlayer = localAudioPlayer;
    if (!currentPlayer) return;
    try {
      const query = new URLSearchParams({ cdEntryId: String(currentPlayer.catalogEntryId), trackId: String(currentPlayer.trackId) });
      const response = await fetch(`/api/music-library/playback/next?${query.toString()}`);
      const data = await response.json() as { next?: LocalAudioPlayer | null; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to find the next local track.');
      if (data.next) {
        setLocalAudioPlayer(data.next);
        return;
      }
      setPersonalMusicStatus('Reached the end of the available personal music playback queue.');
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to find the next local track.');
    }
  }

  async function scanCatalogPersonalLocations() {
    setMusicLibraryStatus('Starting catalog local-copy matching...');
    try {
      const response = await fetch('/api/music-library/catalog-personal-locations/scan', { method: 'POST' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to start catalog local-copy matching.');
      setMusicLibraryStatus('Matching catalog albums against your indexed local music. You can leave this page while it runs.');
    } catch (error) {
      setMusicLibraryStatus(error instanceof Error ? error.message : 'Unable to start catalog local-copy matching.');
    }
  }

  async function playPreviousLocalCopy() {
    const currentPlayer = localAudioPlayer;
    if (!currentPlayer) return;
    try {
      const query = new URLSearchParams({ cdEntryId: String(currentPlayer.catalogEntryId), trackId: String(currentPlayer.trackId) });
      const response = await fetch(`/api/music-library/playback/previous?${query.toString()}`);
      const data = await response.json() as { previous?: LocalAudioPlayer | null; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to find the previous local track.');
      if (data.previous) {
        setLocalAudioPlayer(data.previous);
        return;
      }
      setPersonalMusicStatus('Reached the beginning of the available personal music playback queue.');
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to find the previous local track.');
    }
  }

  async function syncPersonalTrackLocations() {
    if (!viewedEntry || !detailTracks.length || personalLocationSyncing) return;
    const playableTracks = detailTracks.filter((track) => !track.isComposite);
    if (!playableTracks.length) return;
    setPersonalLocationSyncing(true);
    setPersonalMusicStatus(`Syncing personal locations for ${playableTracks.length} tracks...`);
    try {
      const response = await fetch(`/api/cds/${viewedEntry.id}/personal-track-matches/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: playableTracks.map((track) => ({ trackKey: trackKey(track), title: track.title })) }),
      });
      const responseText = await response.text();
      let data: { matches?: PersonalTrackMatch[]; matchedCount?: number; unmatchedCount?: number; error?: string } = {};
      try { data = responseText ? JSON.parse(responseText) as typeof data : {}; } catch { /* malformed responses are handled below */ }
      if (!response.ok) throw new Error(data.error || 'Unable to sync personal music locations.');
      setPersonalTrackMatches(data.matches ?? []);
      setPersonalMusicStatus(`${data.matchedCount ?? 0} of ${playableTracks.length} personal track locations synced${data.unmatchedCount ? `; ${data.unmatchedCount} not found.` : '.'}`);
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to sync personal music locations.');
    } finally {
      setPersonalLocationSyncing(false);
    }
  }

  /* async function findPersonalAlbumFolder() {
    if (!viewedEntry) return;
    setPersonalMusicStatus(`Looking for the local album folder for “${viewedEntry.title}”...`);
    setPersonalAlbumFolders(null);
    try {
      const response = await fetch(`/api/music-library/albums/find?cdEntryId=${viewedEntry.id}`);
      const data = await response.json() as { status?: 'found' | 'notFound' | 'unindexed'; albums?: PersonalAlbumFolder[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to search the personal music library.');
      if (data.status === 'found' && data.albums?.length) {
        setPersonalAlbumFolders(data.albums);
        setPersonalMusicStatus(`Found ${data.albums.length} matching local album ${data.albums.length === 1 ? 'folder' : 'folders'}.`);
      } else if (data.status === 'unindexed') {
        setPersonalMusicStatus('Your music library has not been scanned yet. Open Music Library and choose Scan library.');
      } else {
        setPersonalMusicStatus('No matching local album folder was found. Try scanning or rescanning the music library.');
      }
    } catch (error) {
      setPersonalMusicStatus(error instanceof Error ? error.message : 'Unable to search the personal music library.');
    }
  } */

  async function savePersonalAlbumFolder(folderPath: string | null) {
    if (!viewedEntry) return;
    setPersonalAlbumMappingStatus(folderPath ? 'Saving personal album folder...' : 'Clearing personal album folder...');
    try {
      const response = await fetch(`/api/cds/${viewedEntry.id}/personal-album-folder`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath }),
      });
      const updated = await response.json() as CdEntry & { error?: string };
      if (!response.ok) throw new Error(updated.error || 'Unable to save the personal album folder.');
      setViewedEntry(updated);
      setItems((current) => current.map((item) => item.id === updated.id ? { ...item, personalAlbumFolderPath: updated.personalAlbumFolderPath, personalAlbumFolderMappedAt: updated.personalAlbumFolderMappedAt } : item));
      if (updated.personalAlbumFolderPath) {
        setPersonalMusicStatus('Personal album folder saved. Try the track again.');
        setPersonalArtistFolders(null);
        setPersonalBrowsableAlbumFolders(null);
        setShowPersonalFolderMapping(false);
      } else {
        setPersonalAlbumMappingStatus('Personal album folder mapping cleared.');
      }
    } catch (error) {
      setPersonalAlbumMappingStatus(error instanceof Error ? error.message : 'Unable to save the personal album folder.');
    }
  }

  async function startMarketStatsBackfill() {
    const confirmed = window.confirm('Update valuations visits each cataloged Discogs release page one at a time. It may take around 30 minutes for a full collection, but you can keep using the app while it runs. Start the update now?');
    if (!confirmed) return;
    setMarketStatsBackfillStatus('Starting valuation update...');
    try {
      const response = await fetch('/api/catalog-discogs-market-stats-backfill', { method: 'POST' });
      const data = await response.json() as MarketStatsBackfill & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to start the valuation update.');
      setMarketStatsBackfill(data);
      setMarketStatsBackfillStatus('Valuation update started. You can leave this page while it runs.');
    } catch (error) {
      setMarketStatsBackfillStatus(error instanceof Error ? error.message : 'Unable to start the valuation update.');
    }
  }

  async function startDiscogsCollectionSync() {
    const sync = discogsCollectionSync;
    if (!sync) return;
    const confirmed = window.confirm(`Sync your catalog to Discogs? The app will check your Discogs Collection first, then add only missing releases. It will never remove anything from Discogs. Up to ${sync.pending.toLocaleString()} release${sync.pending === 1 ? '' : 's'} may be added.`);
    if (!confirmed) return;
    setDiscogsCollectionSyncStatus('Starting Discogs collection sync...');
    try {
      const response = await fetch('/api/discogs/collection-sync', { method: 'POST' });
      const data = await response.json() as DiscogsCollectionSync & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to start the Discogs collection sync.');
      setDiscogsCollectionSync((current) => current ? { ...current, sync: data } : current);
      setDiscogsCollectionSyncStatus('Discogs collection sync started. You can leave this page while it runs.');
    } catch (error) {
      setDiscogsCollectionSyncStatus(error instanceof Error ? error.message : 'Unable to start the Discogs collection sync.');
    }
  }

  function beginManualPersonalAlbumMatch() {
    if (!personalTrackNotFoundPrompt) return;
    setPersonalTrackNotFoundPrompt(null);
    setShowPersonalFolderMapping(true);
    setSelectedPersonalArtistFolderPath('');
    setSelectedPersonalAlbumFolderPath('');
    setPersonalAlbumValidation('idle');
    void browsePersonalArtistFolders();
  }

  async function browsePersonalArtistFolders() {
    setPersonalAlbumMappingStatus('Loading indexed artist folders...');
    setPersonalBrowsableAlbumFolders(null);
    try {
      const response = await fetch('/api/music-library/folders/artists');
      const data = await response.json() as { folders?: PersonalArtistFolder[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load indexed artist folders.');
      setPersonalArtistFolders(data.folders ?? []);
      setPersonalAlbumMappingStatus('Choose the base artist folder, then choose the album folder.');
    } catch (error) {
      setPersonalAlbumMappingStatus(error instanceof Error ? error.message : 'Unable to load indexed artist folders.');
    }
  }

  async function browsePersonalAlbumFolders(artistFolderPath: string) {
    setPersonalAlbumMappingStatus('Loading indexed album folders...');
    setSelectedPersonalArtistFolderPath(artistFolderPath);
    setSelectedPersonalAlbumFolderPath('');
    setPersonalAlbumValidation('idle');
    try {
      const response = await fetch(`/api/music-library/folders/albums?${new URLSearchParams({ artistFolderPath })}`);
      const data = await response.json() as { folders?: PersonalBrowsableAlbumFolder[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load indexed album folders.');
      setPersonalBrowsableAlbumFolders(data.folders ?? []);
      setPersonalAlbumMappingStatus('Choose the album folder that contains this release.');
    } catch (error) {
      setPersonalAlbumMappingStatus(error instanceof Error ? error.message : 'Unable to load indexed album folders.');
    }
  }

  async function validatePersonalAlbumFolder(folderPath: string) {
    if (!viewedEntry || !folderPath) return;
    setSelectedPersonalAlbumFolderPath(folderPath);
    setPersonalAlbumValidation('checking');
    setPersonalAlbumMappingStatus('Checking every indexed track against the Discogs release...');
    try {
      const response = await fetch(`/api/cds/${viewedEntry.id}/personal-album-folder/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath }) });
      const data = await response.json() as { valid?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to validate the album folder.');
      if (data.valid) {
        setPersonalAlbumValidation('valid');
        setPersonalAlbumMappingStatus('All tracks matched one-to-one. You can save this folder.');
      } else {
        setPersonalAlbumValidation('invalid');
        setPersonalAlbumMappingStatus('Cannot make one-to-one track associations for this folder.');
      }
    } catch (error) {
      setPersonalAlbumValidation('invalid');
      setPersonalAlbumMappingStatus(error instanceof Error ? error.message : 'Unable to validate the album folder.');
    }
  }

  function beginEstimatedValueEdit() {
    if (!viewedEntry) return;
    setEstimatedValueInput(viewedEntry.estimatedValue != null ? String(viewedEntry.estimatedValue) : '');
    setEstimatedValueStatus('');
    setEditingEstimatedValue(true);
  }

  async function saveEstimatedValue() {
    if (!viewedEntry || catalogSaveInFlightRef.current) return;
    const trimmedValue = estimatedValueInput.trim();
    const estimatedValue = trimmedValue === '' ? null : Number(trimmedValue);
    if (estimatedValue !== null && (!Number.isFinite(estimatedValue) || estimatedValue < 0)) {
      setEstimatedValueStatus('Enter a non-negative dollar amount, or leave the field blank to clear it.');
      return;
    }
    catalogSaveInFlightRef.current = true;
    setEstimatedValueStatus('Saving estimated value...');
    setCatalogSaveAction('Updating estimated value…');
    try {
      const response = await fetch(`/api/cds/${viewedEntry.id}/estimated-value`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estimatedValue }),
      });
      const updated = await response.json() as CdEntry & { error?: string };
      if (!response.ok) throw new Error(updated.error || 'Unable to save the estimated value.');
      setViewedEntry(updated);
      setItems((current) => current.map((item) => item.id === updated.id ? { ...item, estimatedValue: updated.estimatedValue, estimatedValueIsManual: updated.estimatedValueIsManual, estimatedValueReviewedAt: updated.estimatedValueReviewedAt, valueLastCheckedAt: updated.valueLastCheckedAt } : item));
      setEditingEstimatedValue(false);
      setEstimatedValueStatus(updated.estimatedValue != null ? 'Estimated value saved.' : 'Estimated value cleared.');
    } catch (error) {
      setEstimatedValueStatus(error instanceof Error ? error.message : 'Unable to save the estimated value.');
    } finally {
      catalogSaveInFlightRef.current = false;
      setCatalogSaveAction(null);
    }
  }

  function beginCatalogDetailsEdit() {
    if (!viewedEntry) return;
    setCatalogDetailsForm({
      title: viewedEntry.title,
      artist: viewedEntry.artist,
      year: viewedEntry.year != null ? String(viewedEntry.year) : '',
      country: viewedEntry.country || '',
      label: viewedEntry.label || '',
      format: viewedEntry.format || '',
      catalogNumber: viewedEntry.catalogNumber || '',
      barcode: viewedEntry.barcode || '',
      mediaCondition: viewedEntry.mediaCondition || '',
      notes: viewedEntry.notes || '',
    });
    setCatalogDetailsStatus('');
    setEditingCatalogDetails(true);
  }

  async function saveCatalogDetails(event: FormEvent) {
    event.preventDefault();
    if (!viewedEntry || !catalogDetailsForm || catalogSaveInFlightRef.current) return;
    const year = catalogDetailsForm.year.trim() ? Number(catalogDetailsForm.year) : null;
    if (year != null && (!Number.isInteger(year) || year < 1000 || year > 9999)) {
      setCatalogDetailsStatus('Enter a valid four-digit year, or leave it blank.');
      return;
    }
    catalogSaveInFlightRef.current = true;
    setCatalogDetailsStatus('Saving catalog details...');
    setCatalogSaveAction('Updating catalog details…');
    try {
      const response = await fetch(`/api/cds/${viewedEntry.id}/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...catalogDetailsForm, year }),
      });
      const updated = await response.json() as CdEntry & { error?: string };
      if (!response.ok) throw new Error(updated.error || 'Unable to save catalog details.');
      setViewedEntry(updated);
      setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setEditingCatalogDetails(false);
      setCatalogDetailsForm(null);
      setCatalogDetailsStatus('Catalog details saved.');
    } catch (error) {
      setCatalogDetailsStatus(error instanceof Error ? error.message : 'Unable to save catalog details.');
    } finally {
      catalogSaveInFlightRef.current = false;
      setCatalogSaveAction(null);
    }
  }

  const uiLockMessage = catalogSaveAction;
  const uiLockDetail = catalogSaveAction
    ? 'Please wait while the update completes.'
    : '';

  return (
    <div className={`app-layout${localAudioPlayer ? ' has-local-audio-player' : ''}`} aria-busy={Boolean(uiLockMessage)} onKeyDownCapture={(event) => {
      if (uiLockMessage) { event.preventDefault(); event.stopPropagation(); }
    }}>
      {uiLockMessage ? <div className="catalog-save-overlay" role="status" aria-live="assertive"><div><strong>{uiLockMessage}</strong><span>{uiLockDetail}</span></div></div> : null}
      <aside className="app-nav" aria-label="Application navigation">
        <div className="app-brand">Discogs Manager</div>
        <button type="button" className={activePage === 'search' ? 'active' : ''} onClick={() => setActivePage('search')}>Search &amp; Scan</button>
        <button type="button" className={activePage === 'catalog' ? 'active' : ''} onClick={() => setActivePage('catalog')}>Catalog</button>
        <button type="button" className={activePage === 'statistics' ? 'active' : ''} onClick={() => setActivePage('statistics')}>Catalog Statistics</button>
        <button type="button" className={activePage === 'library' ? 'active' : ''} onClick={() => setActivePage('library')}>Music Library</button>
      </aside>
      <main className={`app-shell${activePage === 'catalog' ? ' catalog-shell' : ''}`}>
      {activePage === 'statistics' && (
        <>
          <h1>Catalog Statistics</h1>
          <p>Collection totals based on the market values currently stored in your local catalog.</p>
          <details className="card catalog-statistics-section">
            <summary>Collection Value Overview</summary>
            <div className="catalog-statistics-section-content">
              <div className="catalog-statistics-grid">
                <section className="card catalog-statistic-card"><span>Catalog Entries</span><strong>{catalogStatistics ? catalogStatistics.totalEntries.toLocaleString() : '—'}</strong></section>
                <section className="card catalog-statistic-card"><span>Discogs Median Total</span><strong>{catalogStatistics ? formatDiscogsMarketPrice(catalogStatistics.discogsMedian.total, 'USD') : '—'}</strong><small>{catalogStatistics ? `${catalogStatistics.discogsMedian.count.toLocaleString()} releases with a known Discogs median` : 'Loading…'}</small></section>
                <section className="card catalog-statistic-card"><span>Estimated Value Total</span><strong>{catalogStatistics ? formatDiscogsMarketPrice(catalogStatistics.estimatedValue.total, 'USD') : '—'}</strong><small>{catalogStatistics ? `${catalogStatistics.estimatedValue.count.toLocaleString()} releases with an estimated value` : 'Loading…'}</small></section>
              </div>
            </div>
          </details>
          <details className="card catalog-statistics-section">
            <summary>Style Distribution</summary>
            <div className="catalog-statistics-section-content">
              <p className="hint">Each style shows the share of catalog CDs carrying that tag. Multi-style releases appear in every applicable style, so percentages may total more than 100%.</p>
              {catalogStatistics ? <div className="style-distribution-content" aria-label="Style distribution">
                <ul className="style-distribution-list">
                  {catalogStatistics.styles.map((style, index) => <li key={style.style}>
                    <button type="button" className="style-distribution-entry" onClick={() => { collectionLoadInFlightRef.current = false; setCollectionStyle(style.style); setCollectionPage(1); setItems([]); setCollectionTotal(0); setActivePage('catalog'); }} aria-label={`View ${style.style} catalog entries`}>
                      <div className="style-distribution-label"><span className="genre-legend-swatch" style={{ backgroundColor: STYLE_CHART_COLORS[index % STYLE_CHART_COLORS.length] }} aria-hidden="true" /><strong>{style.style}</strong><span>{style.percentage.toFixed(1)}% · {style.count.toLocaleString()} CDs</span></div>
                      <div className="style-distribution-bar-track"><span className="style-distribution-bar" style={{ width: `${style.percentage}%`, backgroundColor: STYLE_CHART_COLORS[index % STYLE_CHART_COLORS.length] }} /></div>
                    </button>
                  </li>)}
                </ul>
              </div> : <p className="hint">Loading style distribution…</p>}
            </div>
          </details>
          <details className="card catalog-statistics-section">
            <summary>Decade Distribution</summary>
            <div className="catalog-statistics-section-content">
              <p className="hint">Each catalog entry is counted once using its Discogs release year. Entries without a known year are grouped separately.</p>
              {catalogStatistics ? <div className="style-distribution-content" aria-label="Decade distribution">
                <ul className="style-distribution-list">
                  {catalogStatistics.decades.map((decade, index) => <li key={decade.decade}>
                    <div className="style-distribution-entry">
                      <div className="style-distribution-label"><span className="genre-legend-swatch" style={{ backgroundColor: STYLE_CHART_COLORS[index % STYLE_CHART_COLORS.length] }} aria-hidden="true" /><strong>{decade.decade}</strong><span>{decade.percentage.toFixed(1)}% · {decade.count.toLocaleString()} CDs</span></div>
                      <div className="style-distribution-bar-track"><span className="style-distribution-bar" style={{ width: `${decade.percentage}%`, backgroundColor: STYLE_CHART_COLORS[index % STYLE_CHART_COLORS.length] }} /></div>
                    </div>
                  </li>)}
                </ul>
              </div> : <p className="hint">Loading decade distribution…</p>}
            </div>
          </details>
          {catalogStatisticsStatus ? <p className="hint">{catalogStatisticsStatus}</p> : null}
        </>
      )}
      {activePage === 'library' && (
        <>
          <h1>Music Library</h1>
          <p>Connect the folder containing your personally ripped and tagged music. Files remain on this PC and are only streamed locally when you choose to play one.</p>
          <div className="card music-library-card">
            <h2>Personal music folder</h2>
            <label htmlFor="music-library-path">Library Folder</label>
            <input id="music-library-path" value={musicLibraryPath} onChange={(event) => setMusicLibraryPath(event.target.value)} placeholder="H:\\Music\\Rips" />
            <div className="form-actions">
              <button type="button" onClick={() => void saveMusicLibrary()} disabled={savingMusicLibrary || !musicLibraryPath.trim()}>{savingMusicLibrary ? 'Saving...' : 'Save Folder'}</button>
              <button type="button" className="secondary-button" onClick={() => void scanMusicLibrary()} disabled={!musicLibrary?.rootPath || musicLibrary.scan.status === 'scanning'}>{musicLibrary?.scan.status === 'scanning' ? 'Scanning...' : 'Scan Library'}</button>
            </div>
            {musicLibrary?.rootPath ? <div className="music-library-summary"><strong>Current folder:</strong> {musicLibrary.rootPath}<br /><strong>Indexed tracks:</strong> {musicLibrary.trackCount.toLocaleString()}{musicLibrary.lastScannedAt ? <> · last scan {new Date(musicLibrary.lastScannedAt).toLocaleString()}</> : null}</div> : <p className="hint">Save the folder first, then run the initial scan.</p>}
            {musicLibrary?.scan.status === 'scanning' ? <p className="hint">Scanning: {musicLibrary.scan.scannedFiles.toLocaleString()} files checked · {musicLibrary.scan.indexedFiles.toLocaleString()} indexed · {musicLibrary.scan.skippedFiles.toLocaleString()} skipped</p> : null}
            {musicLibrary?.scan.status === 'failed' ? <p className="hint">Scan failed: {musicLibrary.scan.error}</p> : null}
            {musicLibraryStatus ? <p className="hint">{musicLibraryStatus}</p> : null}
          </div>
          <div className="card music-library-card">
            <h2>Catalog Local Copies</h2>
            <p>Compare every catalog artist and album against your indexed, tagged music and save high-confidence album-folder matches. This uses only your local database and files already indexed by Scan Library.</p>
            <div className="form-actions">
              <button type="button" onClick={() => void scanCatalogPersonalLocations()} disabled={!musicLibrary?.rootPath || musicLibrary.trackCount === 0 || musicLibrary.catalogLocationScan.status === 'scanning' || musicLibrary.scan.status === 'scanning'}>{musicLibrary?.catalogLocationScan.status === 'scanning' ? 'Matching Catalog...' : 'Scan Catalog for Local Copies'}</button>
            </div>
            {musicLibrary?.catalogLocationScan.status === 'scanning' ? <p className="hint">Progress: {musicLibrary.catalogLocationScan.processed.toLocaleString()} / {musicLibrary.catalogLocationScan.total.toLocaleString()} catalog albums checked · {musicLibrary.catalogLocationScan.matched.toLocaleString()} new matches · {musicLibrary.catalogLocationScan.alreadyMapped.toLocaleString()} already linked</p> : null}
            {musicLibrary?.catalogLocationScan.status === 'complete' ? <p className="hint">Complete: {musicLibrary.catalogLocationScan.processed.toLocaleString()} catalog albums checked · {musicLibrary.catalogLocationScan.matched.toLocaleString()} new matches · {musicLibrary.catalogLocationScan.alreadyMapped.toLocaleString()} existing links retained · {musicLibrary.catalogLocationScan.unmatched.toLocaleString()} not found.</p> : null}
            {musicLibrary?.catalogLocationScan.status === 'failed' ? <p className="hint">Catalog local-copy matching failed: {musicLibrary.catalogLocationScan.error || 'Unknown error.'}</p> : null}
          </div>
          <div className="card music-library-card">
            <h2>Catalog valuations</h2>
            <p>Refresh Discogs Last Sold, Low, Median, and High values for every catalog entry with a Discogs release. The process runs in the background at a respectful pace.</p>
            <div className="form-actions">
              <button type="button" onClick={() => void startMarketStatsBackfill()} disabled={marketStatsBackfill?.status === 'running'}>{marketStatsBackfill?.status === 'running' ? 'Updating Valuations...' : 'Update Valuations'}</button>
            </div>
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
              <div className="form-actions">
                <button type="button" onClick={() => void startDiscogsCollectionSync()} disabled={discogsCollectionSync.sync.status === 'running'}>{discogsCollectionSync.sync.status === 'running' ? 'Syncing Discogs Collection...' : 'Sync Catalog to Discogs'}</button>
              </div>
              {discogsCollectionSync.sync.status === 'running' ? <p className="hint">Progress: {discogsCollectionSync.sync.processed.toLocaleString()} / {discogsCollectionSync.sync.total.toLocaleString()} · {discogsCollectionSync.sync.added.toLocaleString()} added · {discogsCollectionSync.sync.alreadyInCollection.toLocaleString()} already in Discogs.</p> : null}
              {discogsCollectionSync.sync.status === 'complete' ? <p className="hint">Sync complete{discogsCollectionSync.sync.username ? ` for ${discogsCollectionSync.sync.username}` : ''}: {discogsCollectionSync.sync.added.toLocaleString()} added · {discogsCollectionSync.sync.alreadyInCollection.toLocaleString()} already in Discogs · {discogsCollectionSync.sync.failed.toLocaleString()} failed.</p> : null}
              {discogsCollectionSync.sync.status === 'failed' ? <p className="hint">Sync failed: {discogsCollectionSync.sync.error || 'Unknown error.'}</p> : null}
            </>}
            {discogsCollectionSyncStatus ? <p className="hint">{discogsCollectionSyncStatus}</p> : null}
          </div>
        </>
      )}
      {activePage === 'search' && (
        <>
      <h1>Search &amp; Scan</h1>
      <p>Look up a CD, scan its barcode, select the version you own, and add it to your catalog.</p>

      <div className="search-workspace" ref={addCardRef}>
      <section className="card search-panel">
        <h2>{entryBeingCorrected ? 'Correct Discogs match' : 'Add a CD'}</h2>
        {entryBeingCorrected ? <p className="hint">Correcting <strong>{entryBeingCorrected.artist} — {entryBeingCorrected.title}</strong>. Your notes and condition are retained; valuation is refreshed or cleared.</p> : null}

        <label>Search Discogs</label>
        <form
          className="search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSearch();
          }}
        >
          <div className="search-input-grid">
            <input
              value={searchArtist}
              onChange={(e) => {
                setSearchArtist(e.target.value);
                setHasSearched(false);
                setCurrentPage(1);
              }}
              placeholder="Artist"
            />
            <input
              value={searchAlbumTitle}
              onChange={(e) => {
                setSearchAlbumTitle(e.target.value);
                setHasSearched(false);
                setCurrentPage(1);
              }}
              placeholder="Album Title"
            />
            <div className="catalog-number-voice-input">
              <input
                value={searchCatalogNumber}
                onChange={(e) => {
                  setSearchCatalogNumber(e.target.value);
                  setHasSearched(false);
                  setCurrentPage(1);
                }}
                placeholder="Catalog Number"
                aria-label="Catalog Number"
              />
              <button type="button" className="secondary-button catalog-voice-button" onClick={catalogVoiceListening ? stopCatalogNumberVoiceEntry : startCatalogNumberVoiceEntry} aria-label={catalogVoiceListening ? 'Stop catalog number voice entry' : 'Speak catalog number'} title={catalogVoiceListening ? 'Stop listening' : 'Speak catalog number'}>
                {catalogVoiceListening ? 'Stop Listening' : '🎙 Speak'}
              </button>
            </div>
            <input
              value={searchBarcode}
              onChange={(e) => {
                setSearchBarcode(e.target.value);
                setHasSearched(false);
                setCurrentPage(1);
              }}
              placeholder="Barcode"
            />
          </div>
          <div className="search-actions">
            <button type="submit" disabled={loading || (!searchArtist.trim() && !searchAlbumTitle.trim() && !searchCatalogNumber.trim() && !searchBarcode.trim())}>{loading ? 'Searching...' : 'Look Up'}</button>
            <button type="button" className="secondary-button" onClick={clearSearch} disabled={loading}>Clear</button>
            <label className="ebay-search-toggle"><input type="checkbox" checked={includeDiscogsMarketStats} onChange={(event) => setIncludeDiscogsMarketStats(event.target.checked)} /> Include Discogs Market Statistics</label>
            <label className="ebay-search-toggle"><input type="checkbox" checked={includeEbayAuctionValues} onChange={(event) => setIncludeEbayAuctionValues(event.target.checked)} /> Include Current eBay Auction Values</label>
          </div>
          {catalogVoiceStatus ? <p className="hint catalog-voice-status" aria-live="polite">{catalogVoiceStatus}</p> : null}
        </form>

        <div className="search-section-divider" />
        <section className="scanner-section">
          <h3>Barcode scanner</h3>
          <p className="hint">Use your phone camera to fill the barcode search field automatically.</p>
          <button type="button" onClick={() => { setScannerStatus('Opening camera...'); setScannerOpen(true); }}>
            Scan Barcode
          </button>
        </section>

        {scannerOpen && (
          <div className="scanner-dialog" role="dialog" aria-modal="true" aria-label="Barcode scanner">
            <button type="button" className="dialog-close-button scanner-close" aria-label="Close barcode scanner" title="Close" onClick={() => setScannerOpen(false)}>×</button>
            <video ref={scannerVideoRef} className="scanner-video" muted playsInline />
            <p>{scannerStatus}</p>
          </div>
        )}

        <p className="hint">{searchSummary}</p>

        {results.length > 0 && (
          <>
            <div className="search-criteria">
              <div><strong>Artist Name:</strong> {searchArtist || 'Any artist'}</div>
              <div><strong>Album Title:</strong> {searchAlbumTitle || 'Any album title'}</div>
            </div>
            <div className="result-filter">
              <label>
                Country
                <select
                  aria-label="Filter search results by country"
                  value={resultCountryFilter}
                  disabled={availableResultCountries.length < 2}
                  onChange={(event) => { setResultCountryFilter(event.target.value); setCurrentPage(1); }}
                >
                  <option value="">All countries</option>
                  {availableResultCountries.map((country) => <option key={country} value={country}>{country}</option>)}
                </select>
              </label>
            </div>
            <div className="results-list">
            {visibleResults.map((release) => {
                const coverArt = release.coverImage || coverImages[release.id] || release.thumb;

              return (
              <div
                key={release.id}
                role="button"
                tabIndex={0}
                className={`result-card ${selectedRelease?.id === release.id ? 'selected' : ''}`}
                onClick={() => { void selectSearchResult(release); }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    void selectSearchResult(release);
                  }
                }}
              >
                <div className="result-cover-column">
                  {coverArt ? (
                    <img className="cover-thumbnail" src={coverArt} alt={`Cover art for ${release.title}`} />
                  ) : (
                    <div className="cover-placeholder" aria-label="No cover art available">No cover art</div>
                  )}
                  {selectedRelease?.id === release.id ? <button type="button" className="edit-add-button" onClick={(event) => { event.stopPropagation(); openSelectedReleaseEditor(); }}>Edit &amp; Add</button> : null}
                </div>
                <div className="result-content">
                  <strong className="result-artist">{release.artist || 'Unknown artist'}</strong>
                  <div className="result-title">{release.title || 'Untitled release'}</div>
                  <div className="result-details">
                    <div><strong>Release Year:</strong> {release.year ?? 'Unknown'}</div>
                    <div><strong>{selectedRelease?.id === release.id ? 'Release Label:' : 'Search-Result Label:'}</strong> {release.label ?? 'Unknown'}</div>
                    <div><strong>Country:</strong> {release.country ?? 'Unknown'}</div>
                    <div><strong>Catalog Number:</strong> {release.catalogNumber ?? 'Not listed'}</div>
                    {release.barcode ? <div><strong>Barcode:</strong> {release.barcode}</div> : null}
                    <div><strong>Format:</strong> {release.format || 'Unknown'}</div>
                    {selectedRelease?.id === release.id && releaseContext?.genre ? <div><strong>Genre:</strong> {releaseContext.genre}</div> : null}
                    {selectedRelease?.id === release.id && releaseContext?.style ? <div><strong>Style:</strong> {releaseContext.style}</div> : null}
                  </div>
                  {selectedRelease?.id === release.id && (
                    <>
                      {releaseCatalogInfoStatus ? <p className="hint">{releaseCatalogInfoStatus}</p> : null}
                      {includeDiscogsMarketStats && <div className="price-suggestions" aria-live="polite">
                        <strong>Discogs Market Statistics:</strong>
                        {discogsSearchMarketStatsStatus ? <div>{discogsSearchMarketStatsStatus}</div> : null}
                        {discogsSearchMarketStats && (discogsSearchMarketStats.low != null || discogsSearchMarketStats.median != null || discogsSearchMarketStats.high != null) ? <div>
                          <strong>Low / Median / High:</strong>{' '}
                          {formatDiscogsMarketPrice(discogsSearchMarketStats.low, discogsSearchMarketStats.currency)} /{' '}
                          {formatDiscogsMarketPrice(discogsSearchMarketStats.median, discogsSearchMarketStats.currency)} /{' '}
                          {formatDiscogsMarketPrice(discogsSearchMarketStats.high, discogsSearchMarketStats.currency)}
                        </div> : null}
                      </div>}
                      {includeEbayAuctionValues && <div className="price-suggestions" aria-live="polite">
                        <strong>eBay Active Listings:</strong>
                        {ebayListingStatus ? <div>{ebayListingStatus}</div> : null}
                        {ebayListingStats?.sampledListingCount ? (
                          <div className={`ebay-listing-results ${ebayListingStats.searchMethod}`}>
                            <div><strong>Matching Listings:</strong> {ebayListingStats.listingCount}</div>
                            <div className={`ebay-search-method ${ebayListingStats.searchMethod}`}><strong>Search Used:</strong>{' '}
                              {ebayListingStats.searchMethod === 'catalogNumber' ? 'Discogs catalog number' : 'artist and album title'}
                            </div>
                            <div><strong>Priced Sample:</strong> {ebayListingStats.sampledListingCount} active listings</div>
                            <div><strong>Low / Average / High:</strong>{' '}
                              {ebayListingStats.currency || '$'} {ebayListingStats.lowestPrice?.toFixed(2)} /{' '}
                              {ebayListingStats.averagePrice?.toFixed(2)} / {ebayListingStats.highestPrice?.toFixed(2)}
                            </div>
                          </div>
                        ) : null}
                        {ebayListingStats ? <div className="price-note">Current asking prices only; not eBay sold-price history.</div> : null}
                      </div>}
                      <div className="release-context-card" aria-live="polite">
                        {releaseContextStatus ? <p>{releaseContextStatus}</p> : null}
                        {releaseContext && releaseContext.descriptionSource !== 'artist' && (
                          <>
                            <div>
                              <strong>
                                {releaseContext.descriptionSource === 'release'
                                  ? 'Release Notes'
                                  : releaseContext.descriptionSource === 'album'
                                    ? 'Album Notes'
                                    : 'Discogs Information'}
                              </strong>
                              <p>{releaseContext.description ? formatDiscogsText(releaseContext.description) : 'Discogs does not provide release or album notes for this selection.'}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
              );
            })}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <nav className="pagination" aria-label="Discogs search result pages">
            <button type="button" onClick={() => setCurrentPage((page) => page - 1)} disabled={currentPage === 1}>
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button type="button" onClick={() => setCurrentPage((page) => page + 1)} disabled={currentPage === totalPages}>
              Next
            </button>
          </nav>
        )}

      </section>

      <aside className="card selected-release-panel" ref={selectedReleasePanelRef} tabIndex={-1}>
        <h2>Selected release</h2>
        {selectedRelease ? (
          <>
            <div className="selected-release-summary">
              <strong>{selectedRelease.artist} — {selectedRelease.title}</strong>
              <div>{selectedRelease.format || 'Format unknown'}{selectedRelease.year ? ` • ${selectedRelease.year}` : ''}</div>
              <div><strong>Label:</strong> {selectedRelease.label || 'Not listed'}</div>
              <div><strong>Catalog Number:</strong> {selectedRelease.catalogNumber || 'Not listed'}</div>
              {selectedRelease.barcode ? <div><strong>Barcode:</strong> {selectedRelease.barcode}</div> : null}
              {releaseContext?.genre ? <div><strong>Genre:</strong> {releaseContext.genre}</div> : null}
              {releaseContext?.style ? <div><strong>Style:</strong> {releaseContext.style}</div> : null}
            </div>
        <form id="catalog-entry-form" onSubmit={handleSave}>
          <label>Title</label>
          <input value={selectedRelease?.title || title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />

          <label>Artist</label>
          <input value={selectedRelease?.artist || artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" />

          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition, purchase details, etc." />

          <label>Media Condition</label>
          <select value={mediaCondition} onChange={(e) => setMediaCondition(e.target.value)}>
            <option value="">Not specified</option>
            {MEDIA_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
          </select>

          <label>Estimated Value</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={estimatedValueOverride}
            onChange={(e) => { setEstimatedValueOverride(e.target.value); setHasEstimatedValueOverride(true); }}
            placeholder="15.00"
          />

          {status ? <p className="status">{status}</p> : null}
          {entryBeingCorrected ? <div className="form-actions"><button type="button" className="secondary-button" onClick={cancelMatchCorrection}>Cancel Correction</button></div> : null}
          <div className="form-actions"><button type="submit" disabled={Boolean(catalogSaveAction)}>{entryBeingCorrected ? 'Apply Corrected Match' : 'Add to Catalog'}</button></div>
        </form>
          </>
        ) : <p className="hint">Select a release result to review it and add it to your catalog.</p>}
      </aside>
      </div>
        </>
      )}

      {activePage === 'catalog' && (
        <>
      <CatalogPage
        items={items}
        search={collectionSearch}
        style={collectionStyle}
        styleOptions={collectionStyleOptions}
        total={collectionTotal}
        isLoading={collectionLoading}
        hasMoreItems={hasMoreCollectionItems}
        status={collectionStatus}
        sort={collectionSort}
        hasOpenDetail={Boolean(viewedEntry)}
        onSearchChange={(value) => { collectionLoadInFlightRef.current = false; setCollectionSearch(value); setCollectionPage(1); setItems([]); setCollectionTotal(0); }}
        onStyleChange={(value) => { collectionLoadInFlightRef.current = false; setCollectionStyle(value); setCollectionPage(1); setItems([]); setCollectionTotal(0); }}
        onSortChange={(value) => { collectionLoadInFlightRef.current = false; setCollectionSort(value); setCollectionPage(1); setItems([]); setCollectionTotal(0); }}
        onOpenDetail={setViewedEntry}
        onChangeAssociation={beginMatchCorrection}
        onSearchEbay={(item) => { void openEbaySearch(item); }}
        onRemove={(item) => { void removeCatalogEntry(item); }}
        onLoadMore={() => {
          if (!collectionLoading && hasMoreCollectionItems && !collectionLoadInFlightRef.current) {
            collectionLoadInFlightRef.current = true;
            setCollectionPage((current) => current + 1);
          }
        }}
      >
        {false && <>
        <div className="collection-toolbar">
          <input
            value={collectionSearch}
            onChange={(event) => {
              setCollectionSearch(event.target.value);
              setCollectionPage(1);
            }}
              placeholder="Search Artist, Album, Catalog #, or Barcode"
            aria-label="Search collection"
          />
          <span>{collectionTotal ? `Showing ${items.length} of ${collectionTotal}` : 'No CDs found'}</span>
        </div>
        </>}
        {false && <>
        {collectionStatus ? <p className="hint collection-status" aria-live="polite">{collectionStatus}</p> : null}
        <div className="collection-column-headings" aria-hidden="true">
          <span />
          <span>Artist</span>
          <span>Album</span>
          <span>Year</span>
          <span>Menu</span>
        </div>
        </>}
        {viewedEntry && (
          <div
            className="collection-detail-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setViewedEntry(null);
              else if (event.target instanceof Element && !event.target.closest('.detail-action-menu')) setDetailActionMenuOpen(false);
            }}
          >
          <section className="collection-detail" role="dialog" aria-modal="true" aria-label={`Details for ${viewedEntry.artist} — ${viewedEntry.title}`}>
            <button type="button" className="dialog-close-button collection-detail-close" aria-label="Close catalog details" title="Close details" onClick={() => setViewedEntry(null)}>×</button>
            <div className="collection-detail-header">
              {detailCoverImage ? (
                <img className="detail-cover" src={detailCoverImage} alt={`Cover art for ${viewedEntry.title}`} />
              ) : (
                <div className="detail-cover cover-placeholder">No cover art</div>
              )}
              <div>
                <h3>{viewedEntry.artist} — {viewedEntry.title}</h3>
                <p>{viewedEntry.format || 'Format unknown'}{viewedEntry.year ? ` • ${viewedEntry.year}` : ''}</p>
                {viewedEntry.discogsUri ? <a href={`https://www.discogs.com${viewedEntry.discogsUri}`} target="_blank" rel="noreferrer">View on Discogs</a> : null}
              </div>
              <div className="collection-detail-controls">
                <div className="detail-action-menu">
                  <button type="button" className="detail-action-menu-trigger" aria-label={`Actions for ${viewedEntry.artist} — ${viewedEntry.title}`} aria-expanded={detailActionMenuOpen} title="Catalog actions" onClick={() => setDetailActionMenuOpen((open) => !open)}>•••</button>
                  {detailActionMenuOpen ? <div className="detail-action-menu-items">
                    <button type="button" onClick={() => { setDetailActionMenuOpen(false); void openEbaySearch(viewedEntry); }}>Open eBay Listings</button>
                    <button type="button" className="secondary-button" disabled={!viewedEntry.discogsId} onClick={() => { setDetailActionMenuOpen(false); openDiscogsMarketplace(viewedEntry); }}>Open Discogs Marketplace</button>
                    <button type="button" className="secondary-button" disabled={!viewedEntry.discogsId && !viewedEntry.discogsUri} onClick={() => { setDetailActionMenuOpen(false); openDiscogsRelease(viewedEntry); }}>Open Discogs Release</button>
                    <button type="button" className="secondary-button" disabled={!viewedEntry.discogsId} onClick={() => { setDetailActionMenuOpen(false); void loadDetailImages(); }}>{showDetailImages ? 'Hide Release Images' : 'Show All Release Images'}</button>
                    <button type="button" className="secondary-button" disabled={!viewedEntry.discogsId} onClick={() => { setDetailActionMenuOpen(false); void openTracklist(); }}>Show Tracklist</button>
                    <button type="button" className="secondary-button" onClick={() => { setDetailActionMenuOpen(false); beginCatalogDetailsEdit(); }}>Edit Catalog Details</button>
                    <button type="button" className="secondary-button" onClick={() => { setDetailActionMenuOpen(false); beginEstimatedValueEdit(); }}>Update Estimated Value</button>
                    <button type="button" className="secondary-button" onClick={() => { setDetailActionMenuOpen(false); beginMatchCorrection(viewedEntry); }}>Correct Discogs Match</button>
                    <button type="button" className="danger-button" onClick={() => { setDetailActionMenuOpen(false); void removeCatalogEntry(viewedEntry); }}>Remove Entry</button>
                  </div> : null}
                </div>
              </div>
            </div>
            {detailStatus ? <p className="hint">{detailStatus}</p> : null}
            <div className="detail-grid">
              <div><strong>Label:</strong> {viewedEntry.label || 'Not listed'}</div>
              <div><strong>Country:</strong> {viewedEntry.country || 'Not listed'}</div>
              <div><strong>Catalog Number:</strong> {viewedEntry.catalogNumber || 'Not listed'}</div>
              {viewedEntry.barcode ? <div><strong>Barcode:</strong> {viewedEntry.barcode}</div> : null}
              {viewedEntry.genre ? <div><strong>Genre:</strong> {viewedEntry.genre}</div> : null}
              {viewedEntry.style ? <div><strong>Style:</strong> {viewedEntry.style}</div> : null}
              <div><strong>Media Condition:</strong> {viewedEntry.mediaCondition || 'Not specified'}</div>
              <div><strong>Estimated Value:</strong> {viewedEntry.estimatedValue != null ? `$${viewedEntry.estimatedValue.toFixed(2)}` : 'Not set'}{viewedEntry.estimatedValueReviewedAt ? ' (Manually Reviewed)' : ''}</div>
            </div>
            <div className="detail-section discogs-market-stats">
              <strong>Discogs Market Statistics</strong>
              {viewedEntry.discogsMarketStatsCheckedAt ? <>
                <div className="detail-grid">
                  <div><strong>Last Sold:</strong> {formatDiscogsMarketDate(viewedEntry.discogsLastSoldAt)}</div>
                  <div><strong>Low:</strong> {formatDiscogsMarketPrice(viewedEntry.discogsMarketLow, viewedEntry.discogsMarketCurrency)}</div>
                  <div><strong>Median:</strong> {formatDiscogsMarketPrice(viewedEntry.discogsMarketMedian, viewedEntry.discogsMarketCurrency)}</div>
                  <div><strong>High:</strong> {formatDiscogsMarketPrice(viewedEntry.discogsMarketHigh, viewedEntry.discogsMarketCurrency)}</div>
                </div>
                <p className="hint">Last checked: {formatDiscogsMarketDate(viewedEntry.discogsMarketStatsCheckedAt)}</p>
              </> : <p className="hint">No recent sale detail found.</p>}
            </div>
            {editingCatalogDetails && catalogDetailsForm ? <form className="detail-section catalog-details-editor" onSubmit={saveCatalogDetails}>
              <strong>Edit Catalog Details</strong>
              <div className="catalog-details-fields">
                <label>Artist<input value={catalogDetailsForm.artist} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, artist: event.target.value })} /></label>
                <label>Album Title<input value={catalogDetailsForm.title} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, title: event.target.value })} /></label>
                <label>Year<input type="number" min="1000" max="9999" value={catalogDetailsForm.year} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, year: event.target.value })} /></label>
                <label>Country<input value={catalogDetailsForm.country} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, country: event.target.value })} /></label>
                <label>Label<input value={catalogDetailsForm.label} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, label: event.target.value })} /></label>
                <label>Format<input value={catalogDetailsForm.format} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, format: event.target.value })} /></label>
                <label>Catalog Number<input value={catalogDetailsForm.catalogNumber} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, catalogNumber: event.target.value })} /></label>
                <label>Barcode<input value={catalogDetailsForm.barcode} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, barcode: event.target.value })} /></label>
                <label>Media Condition<select value={catalogDetailsForm.mediaCondition} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, mediaCondition: event.target.value })}><option value="">Not specified</option>{MEDIA_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}</select></label>
              </div>
              <label>Notes<textarea value={catalogDetailsForm.notes} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, notes: event.target.value })} /></label>
              <div className="form-actions"><button type="submit" disabled={Boolean(catalogSaveAction)}>Save Details</button><button type="button" className="secondary-button" disabled={Boolean(catalogSaveAction)} onClick={() => { setEditingCatalogDetails(false); setCatalogDetailsForm(null); setCatalogDetailsStatus(''); }}>Cancel</button></div>
              {catalogDetailsStatus ? <p className="hint">{catalogDetailsStatus}</p> : null}
            </form> : null}
            {editingEstimatedValue ? <div className="detail-section estimated-value-editor"><strong>Update estimated value</strong><div className="inline-form"><input type="number" min="0" step="0.01" disabled={Boolean(catalogSaveAction)} value={estimatedValueInput} onChange={(event) => setEstimatedValueInput(event.target.value)} placeholder="Leave blank to clear" aria-label="Estimated value" /><button type="button" disabled={Boolean(catalogSaveAction)} onClick={() => void saveEstimatedValue()}>Save Value</button><button type="button" className="secondary-button" disabled={Boolean(catalogSaveAction)} onClick={() => { setEditingEstimatedValue(false); setEstimatedValueStatus(''); }}>Cancel</button></div>{estimatedValueStatus ? <p className="hint">{estimatedValueStatus}</p> : null}</div> : null}
            {viewedEntry.notes ? <div className="detail-section"><strong>Your Notes</strong><p>{viewedEntry.notes}</p></div> : null}
            {detailMusicBrainzContext?.artist ? <div className="detail-section"><strong>Artist Details <span className="hint">- MusicBrainz</span></strong><p>{[detailMusicBrainzContext.artist.type, detailMusicBrainzContext.artist.country, detailMusicBrainzContext.artist.beginDate ? `Formed ${detailMusicBrainzContext.artist.beginDate}` : null, detailMusicBrainzContext.artist.ended && detailMusicBrainzContext.artist.endDate ? `Ended ${detailMusicBrainzContext.artist.endDate}` : null, detailMusicBrainzContext.artist.disambiguation].filter(Boolean).join(' - ')}</p>{detailMusicBrainzContext.artist.genres.length ? <p><strong>Genres:</strong> {detailMusicBrainzContext.artist.genres.map(formatMusicBrainzGenre).join(', ')}</p> : null}</div> : null}
            {detailMusicBrainzContext?.artist?.annotation ? <div className="detail-section"><strong>Artist Summary <span className="hint">- MusicBrainz</span></strong><p className="artist-summary-preview"><span className="artist-summary-desktop">{formatDiscogsText(detailMusicBrainzContext.artist.annotation)}</span><span className="artist-summary-mobile">{previewDiscogsText(formatDiscogsText(detailMusicBrainzContext.artist.annotation))}</span></p><button type="button" className="artist-summary-show-all" onClick={() => setExpandedArtistSummary(formatDiscogsText(detailMusicBrainzContext.artist!.annotation!))}>Show All</button></div> : detailContext?.artistProfile && detailContext.descriptionSource !== 'artist' ? <div className="detail-section"><strong>Artist Summary <span className="hint">- Discogs</span></strong><p className="artist-summary-preview"><span className="artist-summary-desktop">{formatDiscogsText(detailContext.artistProfile)}</span><span className="artist-summary-mobile">{previewDiscogsText(formatDiscogsText(detailContext.artistProfile))}</span></p><button type="button" className="artist-summary-show-all" onClick={() => setExpandedArtistSummary(formatDiscogsText(detailContext.artistProfile!))}>Show All</button></div> : null}
            {detailMusicBrainzContext?.releaseGroup?.annotation ? <div className="detail-section"><strong>Album Notes <span className="hint">- MusicBrainz</span></strong><p>{formatDiscogsText(detailMusicBrainzContext.releaseGroup.annotation)}</p>{detailMusicBrainzContext.releaseGroup.genres.length ? <p><strong>Genres:</strong> {detailMusicBrainzContext.releaseGroup.genres.map(formatMusicBrainzGenre).join(', ')}</p> : null}</div> : detailContext && !(detailContext.descriptionSource === 'artist' && detailMusicBrainzContext?.artist?.annotation) ? <div className="detail-section"><strong>{detailContext.descriptionSource === 'release' ? 'Release Notes' : detailContext.descriptionSource === 'album' ? 'Album Notes' : 'Artist Summary'} <span className="hint">- Discogs</span></strong><p className={detailContext.descriptionSource === 'artist' ? 'artist-summary-preview' : undefined}>{detailContext.description ? <>{detailContext.descriptionSource === 'artist' ? <><span className="artist-summary-desktop">{formatDiscogsText(detailContext.description)}</span><span className="artist-summary-mobile">{previewDiscogsText(formatDiscogsText(detailContext.description))}</span></> : formatDiscogsText(detailContext.description)}</> : 'No additional Discogs notes are available.'}</p>{detailContext.descriptionSource === 'artist' && detailContext.description ? <button type="button" className="artist-summary-show-all" onClick={() => setExpandedArtistSummary(formatDiscogsText(detailContext.description!))}>Show All</button> : null}</div> : null}
            {detailEbayStats?.sampledListingCount ? <div className={`detail-section ebay-listing-results ${detailEbayStats.searchMethod}`}><strong>eBay active listings</strong><p>{detailEbayStats.listingCount} listings found • {detailEbayStats.searchMethod === 'catalogNumber' ? 'catalog number match' : 'artist/title CD search'} • Low / average / high: {detailEbayStats.currency || '$'} {detailEbayStats.lowestPrice?.toFixed(2)} / {detailEbayStats.averagePrice?.toFixed(2)} / {detailEbayStats.highestPrice?.toFixed(2)}</p></div> : null}
            {showDetailImages ? (
              <div className="detail-section release-image-gallery">
                <strong>Release Images</strong>
                {detailImagesStatus ? <p>{detailImagesStatus}</p> : null}
                {detailImages.length ? <div className="release-image-grid">
                  {detailImages.map((image, index) => (
                    <a key={image.url} href={image.url} target="_blank" rel="noreferrer" title="Open full-size image">
                      <img src={image.thumbnailUrl} alt={`${viewedEntry.title} image ${index + 1}`} />
                    </a>
                  ))}
                </div> : null}
              </div>
            ) : null}
            {showTracklist ? (
              <div className="tracklist-overlay" role="presentation" onMouseDown={(event) => {
                if (event.target === event.currentTarget) setShowTracklist(false);
              }}>
                <section className="tracklist-popover" role="dialog" aria-modal="true" aria-label={`Tracklist for ${viewedEntry.title}`}>
                  <button type="button" className="dialog-close-button dialog-close-sticky" aria-label="Close tracklist" title="Close" onClick={() => setShowTracklist(false)}>×</button>
                  <div className="tracklist-header">
                    <div><h3>Tracklist</h3><p>{viewedEntry.artist} — {viewedEntry.title}</p></div>
                    <button type="button" className="secondary-button" disabled={!detailTracks.length || personalLocationSyncing} onClick={() => void syncPersonalTrackLocations()}>{personalLocationSyncing ? 'Syncing Locations...' : 'Sync Personal Locations'}</button>
                  </div>
                  {detailTracksStatus ? <p className="hint">{detailTracksStatus}</p> : null}
                  {personalMusicStatus ? <p className="hint">{personalMusicStatus}</p> : null}
                  {youTubeStatus ? <p className="hint">{youTubeStatus}</p> : null}
                  {youTubeCandidates ? (
                    <div className="youtube-candidate-panel">
                      <strong>Choose a YouTube match for “{youTubeCandidates.track.title}”</strong>
                      <div className="youtube-candidate-list">
                        {youTubeCandidates.videos.map((video) => (
                          <div className="youtube-candidate" key={video.videoId}>
                            {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" /> : <div className="youtube-candidate-thumbnail">No image</div>}
                            <div>
                              <strong>{video.title}</strong>
                              {video.channelTitle ? <span>{video.channelTitle}</span> : null}
                              {video.durationSeconds ? <span>{Math.floor(video.durationSeconds / 60)}:{String(video.durationSeconds % 60).padStart(2, '0')}</span> : null}
                            </div>
                            <button type="button" onClick={() => void chooseYouTubeMatch(youTubeCandidates.track, video)}>Use This Match</button>
                          </div>
                        ))}
                      </div>
                      <button type="button" className="secondary-button" onClick={() => setYouTubeCandidates(null)}>Cancel</button>
                    </div>
                  ) : null}
                  {youTubePlayer ? (
                    <div className="youtube-player-overlay" role="presentation" onMouseDown={(event) => {
                      if (event.target === event.currentTarget) setYouTubePlayer(null);
                    }}>
                      <section className="youtube-player-popover" role="dialog" aria-modal="true" aria-label={`Playing ${youTubePlayer.title}`}>
                        <button type="button" className="dialog-close-button dialog-close-sticky" aria-label="Close YouTube player" title="Close" onClick={() => setYouTubePlayer(null)}>×</button>
                        <div className="youtube-player-header">
                          <strong>{youTubePlayer.title}</strong>
                        </div>
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youTubePlayer.videoId)}?autoplay=1&rel=0`}
                          title={`YouTube player: ${youTubePlayer.title}`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                        <p className="hint">If this video cannot be embedded, <a href={youTubePlayer.watchUrl} target="_blank" rel="noreferrer">open it on YouTube</a>.</p>
                      </section>
                    </div>
                  ) : null}
                  {detailTracks.length ? <ol className="tracklist">
                    {detailTracks.map((track, index) => {
                      const savedMatch = savedYouTubeMatches.find((match) => match.trackKey === trackKey(track));
                      const personalMatch = personalTrackMatches.find((match) => match.trackKey === trackKey(track));
                      return (
                        <li key={`${track.position ?? index}-${track.title}`}>
                          <span className="track-position">{track.position || index + 1}</span>
                          <span className="track-title">{track.title}</span>
                          {track.duration ? <span className="track-duration">{track.duration}</span> : null}
                          {track.isComposite ? <span className="track-suite-note">Suite — individual movements are listed below</span> : <div className="track-actions">
                            <button type="button" onClick={() => personalMatch ? playLocalCopy(personalMatch) : void findPersonalCopy(track)}>{personalMatch ? 'Play Local Copy' : 'Find Personal Copy'}</button>
                            {savedMatch ? <button type="button" onClick={() => { setLocalAudioPlayer(null); setYouTubePlayer({ videoId: savedMatch.videoId, title: savedMatch.videoTitle, watchUrl: savedMatch.videoUrl }); }}>Play Saved Match</button> : null}
                            <button type="button" className="secondary-button" onClick={() => void findYouTubeMatches(track)}>{savedMatch ? 'Change Match' : 'Find Matches'}</button>
                            <button type="button" className="secondary-button" onClick={() => openTrackOnYouTube(track)}>Search</button>
                          </div>}
                        </li>
                      );
                    })}
                  </ol> : null}
                </section>
              </div>
            ) : null}
          </section>
          </div>
        )}
        {false && <>
        <ul className="collection-grid">
          {items.map((item) => (
            <li
              key={item.id}
              className="collection-item"
              role="button"
              tabIndex={0}
              onClick={() => {
                if (!viewedEntry) setViewedEntry(item);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (!viewedEntry) setViewedEntry(item);
                }
              }}
            >
              <div className="collection-cover">
                {item.hasCover ? <img src={`/api/cds/${item.id}/cover`} alt="" /> : <span aria-hidden="true">♫</span>}
              </div>
              <div className="collection-summary">
                <div><span>Artist</span><strong>{item.artist}</strong></div>
                <div><span>Album</span><strong>{item.title}</strong></div>
                <div><span>Year</span><strong>{item.year ?? 'Unknown'}</strong></div>
              </div>
              {/*
              <strong>{item.artist}</strong> — {item.title}
              {item.year ? ` (${item.year})` : ''}
              {item.country ? ` • ${item.country}` : ''}
              {item.estimatedValue != null ? ` • Est. $${item.estimatedValue}` : ''}
              {item.mediaCondition ? ` (${item.mediaCondition})` : ''}
              {item.valueLastCheckedAt ? ` • Checked ${new Date(item.valueLastCheckedAt).toLocaleDateString()}` : ''}
              */}
              <div className="collection-actions" onClick={(event) => event.stopPropagation()}>
                <details className="row-menu">
                  <summary aria-label={`Actions for ${item.artist} — ${item.title}`}>•••</summary>
                  <div className="row-menu-items">
                    <button type="button" onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      if (!viewedEntry) setViewedEntry(item);
                    }}>View Details</button>
                    <button type="button" className="secondary-button" onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      beginMatchCorrection(item);
                    }}>Change Association</button>
                    <button type="button" className="secondary-button" onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      void openEbaySearch(item);
                    }}>Search eBay</button>
                    <button type="button" className="danger-button" onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      void removeCatalogEntry(item);
                    }}>Remove Entry</button>
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>
        {false && collectionTotal > items.length && (
          <nav className="pagination collection-pagination" aria-label="Collection pages">
            <button type="button" onClick={() => setCollectionPage((page) => page - 1)} disabled={collectionPage === 1}>Previous</button>
            <span>Continuous loading is enabled.</span>
            <button type="button" onClick={() => setCollectionPage((page) => page + 1)}>Next</button>
          </nav>
        )}
      </>}
      </CatalogPage>
      {expandedArtistSummary ? <ArtistSummaryDialog summary={expandedArtistSummary} onClose={() => setExpandedArtistSummary(null)} /> : null}
      {personalTrackNotFoundPrompt ? <div className="artist-summary-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPersonalTrackNotFoundPrompt(null); }}><section className="artist-summary-dialog" role="dialog" aria-modal="true" aria-label="Personal music match not found"><button type="button" className="dialog-close-button dialog-close-sticky" aria-label="Close personal music match prompt" title="Close" onClick={() => setPersonalTrackNotFoundPrompt(null)}>×</button><div className="artist-summary-dialog-header"><h2>No personal match found</h2></div><p>No tagged local match was found for <strong>{personalTrackNotFoundPrompt.title}</strong>. If you believe the track is in your scanned music collection, you can make a manual album-folder match.</p><div className="form-actions"><button type="button" onClick={beginManualPersonalAlbumMatch}>Yes, Make Manual Match</button><button type="button" className="secondary-button" onClick={() => setPersonalTrackNotFoundPrompt(null)}>No, Not Now</button></div></section></div> : null}
      {showPersonalFolderMapping ? <div className="artist-summary-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPersonalFolderMapping(false); }}><section className="artist-summary-dialog" role="dialog" aria-modal="true" aria-label="Manual personal album match"><button type="button" className="dialog-close-button dialog-close-sticky" aria-label="Close manual personal album match" title="Close" onClick={() => setShowPersonalFolderMapping(false)}>×</button><div className="artist-summary-dialog-header"><h2>Manual personal album match</h2></div>{personalAlbumValidation === 'invalid' ? <><p>Cannot make one-to-one track associations for this folder.</p><div className="form-actions"><button type="button" onClick={() => setShowPersonalFolderMapping(false)}>OK</button></div></> : <><p>Select the base artist folder and then the album folder. The app will validate every track before enabling Save.</p><label>Artist folder<select value={selectedPersonalArtistFolderPath} onChange={(event) => void browsePersonalAlbumFolders(event.target.value)} disabled={!personalArtistFolders}><option value="">{personalArtistFolders ? 'Choose artist folder' : 'Loading artist folders...'}</option>{personalArtistFolders?.map((folder) => <option key={folder.folderPath} value={folder.folderPath}>{folder.name} ({folder.trackCount} tracks)</option>)}</select></label><label>Album folder<select value={selectedPersonalAlbumFolderPath} onChange={(event) => void validatePersonalAlbumFolder(event.target.value)} disabled={!selectedPersonalArtistFolderPath || !personalBrowsableAlbumFolders || personalAlbumValidation === 'checking'}><option value="">{selectedPersonalArtistFolderPath ? 'Choose album folder' : 'Choose an artist first'}</option>{personalBrowsableAlbumFolders?.map((folder) => <option key={folder.folderPath} value={folder.folderPath}>{folder.album || folder.name} ({folder.trackCount} tracks)</option>)}</select></label>{personalAlbumMappingStatus ? <p className="hint">{personalAlbumMappingStatus}</p> : null}<div className="form-actions"><button type="button" disabled={personalAlbumValidation !== 'valid'} onClick={() => void savePersonalAlbumFolder(selectedPersonalAlbumFolderPath)}>Save Mapping</button><button type="button" className="secondary-button" onClick={() => setShowPersonalFolderMapping(false)}>Cancel</button></div></>}</section></div> : null}
        </>
      )}
      {catalogSaveError ? <div className="artist-summary-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCatalogSaveError(null); }}><section className="artist-summary-dialog catalog-save-error-dialog" role="dialog" aria-modal="true" aria-label="Catalog save error"><button type="button" className="dialog-close-button dialog-close-sticky" aria-label="Close catalog save error" title="Close" onClick={() => setCatalogSaveError(null)}>×</button><div className="artist-summary-dialog-header"><h2>Cannot Save Catalog Entry</h2></div><p>{catalogSaveError}</p><div className="form-actions"><button type="button" autoFocus onClick={() => setCatalogSaveError(null)}>OK</button></div></section></div> : null}
      </main>
      {localAudioPlayer ? <LocalAudioPlayer {...localAudioPlayer} onEnded={() => void playNextLocalCopy()} onPrevious={() => void playPreviousLocalCopy()} onNext={() => void playNextLocalCopy()} onClose={() => setLocalAudioPlayer(null)} onError={setPersonalMusicStatus} /> : null}
    </div>
  );
}

export default App;
