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

type DiscogsReleaseContext = {
  description: string | null;
  descriptionSource: 'release' | 'album' | 'artist' | null;
  artistProfile: string | null;
  genre: string | null;
  style: string | null;
};

type DiscogsReleaseImage = {
  url: string;
  thumbnailUrl: string;
};

type DiscogsReleaseTrack = {
  position: string | null;
  title: string;
  duration: string | null;
};

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
};

type PersonalTrackMatch = {
  trackKey: string;
  libraryTrack: { id: number; artist: string; album: string; title: string; trackNumber: number | null; format: string | null };
};

type LocalAudioPlayer = { trackId: number; title: string; subtitle: string };

type PersonalArtistFolder = { folderPath: string; name: string; trackCount: number };
type PersonalBrowsableAlbumFolder = { folderPath: string; name: string; album: string; trackCount: number };

const RESULTS_PER_PAGE = 20;
const COLLECTION_PAGE_SIZE = 24;
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
  const [activePage, setActivePage] = useState<'search' | 'catalog' | 'library'>('search');
  const [collectionSearch, setCollectionSearch] = useState('');
  const [collectionPage, setCollectionPage] = useState(1);
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionRefresh, setCollectionRefresh] = useState(0);
  const [collectionStatus, setCollectionStatus] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [notes, setNotes] = useState('');
  const [mediaCondition, setMediaCondition] = useState('Very Good Plus (VG+)');
  const [estimatedValueOverride, setEstimatedValueOverride] = useState('15.00');
  const [searchArtist, setSearchArtist] = useState('');
  const [searchAlbumTitle, setSearchAlbumTitle] = useState('');
  const [searchCatalogNumber, setSearchCatalogNumber] = useState('');
  const [searchBarcode, setSearchBarcode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState('');
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const [results, setResults] = useState<DiscogsResult[]>([]);
  const [coverImages, setCoverImages] = useState<Record<number, string | null>>({});
  const requestedCoverIds = useRef(new Set<number>());
  const [selectedRelease, setSelectedRelease] = useState<DiscogsResult | null>(null);
  const [releaseCatalogInfoStatus, setReleaseCatalogInfoStatus] = useState('');
  const [entryBeingCorrected, setEntryBeingCorrected] = useState<CdEntry | null>(null);
  const [viewedEntry, setViewedEntry] = useState<CdEntry | null>(null);
  const [detailCoverImage, setDetailCoverImage] = useState<string | null>(null);
  const [detailContext, setDetailContext] = useState<DiscogsReleaseContext | null>(null);
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
  const [youTubeStatus, setYouTubeStatus] = useState('');
  const [youTubeCandidates, setYouTubeCandidates] = useState<{ track: DiscogsReleaseTrack; videos: YouTubeVideoMatch[] } | null>(null);
  const [savedYouTubeMatches, setSavedYouTubeMatches] = useState<SavedYouTubeTrackMatch[]>([]);
  const [youTubePlayer, setYouTubePlayer] = useState<YouTubePlayer | null>(null);
  const [personalTrackMatches, setPersonalTrackMatches] = useState<PersonalTrackMatch[]>([]);
  const [personalMusicStatus, setPersonalMusicStatus] = useState('');
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
  const [ebayListingStats, setEbayListingStats] = useState<EBayActiveListingStats | null>(null);
  const [ebayListingStatus, setEbayListingStatus] = useState('');
  const [releaseContext, setReleaseContext] = useState<DiscogsReleaseContext | null>(null);
  const [releaseContextStatus, setReleaseContextStatus] = useState('');
  const [expandedArtistSummary, setExpandedArtistSummary] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const addCardRef = useRef<HTMLDivElement>(null);
  const selectedReleasePanelRef = useRef<HTMLElement>(null);

  function openSelectedReleaseEditor() {
    selectedReleasePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(collectionPage), pageSize: String(COLLECTION_PAGE_SIZE) });
      if (collectionSearch.trim()) params.set('q', collectionSearch.trim());
      fetch(`/api/cds?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { items?: CdEntry[]; total?: number }) => {
          setItems(data.items ?? []);
          setCollectionTotal(data.total ?? 0);
        })
        .catch(() => {
          setItems([]);
          setCollectionTotal(0);
        });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [collectionPage, collectionRefresh, collectionSearch]);

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
    void loadLibrary();
    const interval = window.setInterval(() => { void loadLibrary(); }, 1500);
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

  const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
  const visibleResults = useMemo(() => {
    const start = (currentPage - 1) * RESULTS_PER_PAGE;
    return results.slice(start, start + RESULTS_PER_PAGE);
  }, [currentPage, results]);
  const collectionTotalPages = Math.max(1, Math.ceil(collectionTotal / COLLECTION_PAGE_SIZE));
  const collectionStart = collectionTotal ? (collectionPage - 1) * COLLECTION_PAGE_SIZE + 1 : 0;
  const collectionEnd = Math.min(collectionPage * COLLECTION_PAGE_SIZE, collectionTotal);

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
    setDetailEbayStats(null);
    setDetailStatus('Loading live Discogs and eBay details...');
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
      setDetailCoverImage(`/api/cds/${viewedEntry.id}/cover`);
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
    if (!selectedRelease) {
      setEbayListingStats(null);
      setEbayListingStatus('');
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
        setEbayListingStats(stats);
        setEbayListingStatus(stats.sampledListingCount
          ? ''
          : 'No priced active eBay listings were returned for this search.');
      })
      .catch((error: unknown) => {
        if (!cancelled) setEbayListingStatus(error instanceof Error ? error.message : 'Unable to load eBay listings.');
      });

    return () => { cancelled = true; };
  }, [selectedRelease]);

  async function handleSearch(scannedBarcode?: string) {
    const searchArtistValue = searchArtist.trim();
    const searchAlbumTitleValue = searchAlbumTitle.trim();
    const searchCatalogNumberValue = searchCatalogNumber.trim();
    const searchBarcodeValue = scannedBarcode ?? searchBarcode.trim();
    if (!searchArtistValue && !searchAlbumTitleValue && !searchCatalogNumberValue && !searchBarcodeValue) return;

    setLoading(true);
    setHasSearched(true);
    setCurrentPage(1);
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

  async function selectSearchResult(release: DiscogsResult) {
    setExpandedArtistSummary(null);
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
      estimatedValueOverride: estimatedValueOverride.trim() ? Number(estimatedValueOverride) : null,
      notes,
    };

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
      setStatus(error.error || 'Unable to save this CD.');
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
    setYouTubePlayer(null);
    setLocalAudioPlayer({ trackId: match.libraryTrack.id, title: match.libraryTrack.title, subtitle: `${match.libraryTrack.artist} — ${match.libraryTrack.album}` });
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
    if (!viewedEntry) return;
    const trimmedValue = estimatedValueInput.trim();
    const estimatedValue = trimmedValue === '' ? null : Number(trimmedValue);
    if (estimatedValue !== null && (!Number.isFinite(estimatedValue) || estimatedValue < 0)) {
      setEstimatedValueStatus('Enter a non-negative dollar amount, or leave the field blank to clear it.');
      return;
    }
    setEstimatedValueStatus('Saving estimated value...');
    try {
      const response = await fetch(`/api/cds/${viewedEntry.id}/estimated-value`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estimatedValue }),
      });
      const updated = await response.json() as CdEntry & { error?: string };
      if (!response.ok) throw new Error(updated.error || 'Unable to save the estimated value.');
      setViewedEntry(updated);
      setItems((current) => current.map((item) => item.id === updated.id ? { ...item, estimatedValue: updated.estimatedValue, valueLastCheckedAt: updated.valueLastCheckedAt } : item));
      setEditingEstimatedValue(false);
      setEstimatedValueStatus(updated.estimatedValue != null ? 'Estimated value saved.' : 'Estimated value cleared.');
    } catch (error) {
      setEstimatedValueStatus(error instanceof Error ? error.message : 'Unable to save the estimated value.');
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
    if (!viewedEntry || !catalogDetailsForm) return;
    const year = catalogDetailsForm.year.trim() ? Number(catalogDetailsForm.year) : null;
    if (year != null && (!Number.isInteger(year) || year < 1000 || year > 9999)) {
      setCatalogDetailsStatus('Enter a valid four-digit year, or leave it blank.');
      return;
    }
    setCatalogDetailsStatus('Saving catalog details...');
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
    }
  }

  return (
    <div className="app-layout">
      <aside className="app-nav" aria-label="Application navigation">
        <div className="app-brand">Discogs Manager</div>
        <button type="button" className={activePage === 'search' ? 'active' : ''} onClick={() => setActivePage('search')}>Search &amp; Scan</button>
        <button type="button" className={activePage === 'catalog' ? 'active' : ''} onClick={() => setActivePage('catalog')}>Catalog</button>
        <button type="button" className={activePage === 'library' ? 'active' : ''} onClick={() => setActivePage('library')}>Music Library</button>
      </aside>
      <main className="app-shell">
      {activePage === 'library' && (
        <>
          <h1>Music Library</h1>
          <p>Connect the folder containing your personally ripped and tagged music. Files remain on this PC and are only streamed locally when you choose to play one.</p>
          <div className="card music-library-card">
            <h2>Personal music folder</h2>
            <label htmlFor="music-library-path">Library folder</label>
            <input id="music-library-path" value={musicLibraryPath} onChange={(event) => setMusicLibraryPath(event.target.value)} placeholder="H:\\Music\\Rips" />
            <div className="form-actions">
              <button type="button" onClick={() => void saveMusicLibrary()} disabled={savingMusicLibrary || !musicLibraryPath.trim()}>{savingMusicLibrary ? 'Saving...' : 'Save folder'}</button>
              <button type="button" className="secondary-button" onClick={() => void scanMusicLibrary()} disabled={!musicLibrary?.rootPath || musicLibrary.scan.status === 'scanning'}>{musicLibrary?.scan.status === 'scanning' ? 'Scanning...' : 'Scan library'}</button>
            </div>
            {musicLibrary?.rootPath ? <div className="music-library-summary"><strong>Current folder:</strong> {musicLibrary.rootPath}<br /><strong>Indexed tracks:</strong> {musicLibrary.trackCount.toLocaleString()}{musicLibrary.lastScannedAt ? <> · last scan {new Date(musicLibrary.lastScannedAt).toLocaleString()}</> : null}</div> : <p className="hint">Save the folder first, then run the initial scan.</p>}
            {musicLibrary?.scan.status === 'scanning' ? <p className="hint">Scanning: {musicLibrary.scan.scannedFiles.toLocaleString()} files checked · {musicLibrary.scan.indexedFiles.toLocaleString()} indexed · {musicLibrary.scan.skippedFiles.toLocaleString()} skipped</p> : null}
            {musicLibrary?.scan.status === 'failed' ? <p className="hint">Scan failed: {musicLibrary.scan.error}</p> : null}
            {musicLibraryStatus ? <p className="hint">{musicLibraryStatus}</p> : null}
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
              placeholder="Album title"
            />
            <input
              value={searchCatalogNumber}
              onChange={(e) => {
                setSearchCatalogNumber(e.target.value);
                setHasSearched(false);
                setCurrentPage(1);
              }}
              placeholder="Catalog number"
            />
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
          <button type="submit" disabled={loading || (!searchArtist.trim() && !searchAlbumTitle.trim() && !searchCatalogNumber.trim() && !searchBarcode.trim())}>{loading ? 'Searching...' : 'Look up'}</button>
        </form>

        <div className="search-section-divider" />
        <section className="scanner-section">
          <h3>Barcode scanner</h3>
          <p className="hint">Use your phone camera to fill the barcode search field automatically.</p>
          <button type="button" onClick={() => { setScannerStatus('Opening camera...'); setScannerOpen(true); }}>
            Scan barcode
          </button>
        </section>

        {scannerOpen && (
          <div className="scanner-dialog" role="dialog" aria-modal="true" aria-label="Barcode scanner">
            <video ref={scannerVideoRef} className="scanner-video" muted playsInline />
            <p>{scannerStatus}</p>
            <button type="button" onClick={() => setScannerOpen(false)}>Cancel scan</button>
          </div>
        )}

        <p className="hint">{searchSummary}</p>

        {results.length > 0 && (
          <>
            <div className="search-criteria">
              <div><strong>Artist Name:</strong> {searchArtist || 'Any artist'}</div>
              <div><strong>Album Title:</strong> {searchAlbumTitle || 'Any album title'}</div>
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
                    <div><strong>Release year:</strong> {release.year ?? 'Unknown'}</div>
                    <div><strong>{selectedRelease?.id === release.id ? 'Release label:' : 'Search-result label:'}</strong> {release.label ?? 'Unknown'}</div>
                    <div><strong>Country:</strong> {release.country ?? 'Unknown'}</div>
                    <div><strong>Catalog number:</strong> {release.catalogNumber ?? 'Not listed'}</div>
                    {release.barcode ? <div><strong>Barcode:</strong> {release.barcode}</div> : null}
                    <div><strong>Format:</strong> {release.format || 'Unknown'}</div>
                    {selectedRelease?.id === release.id && releaseContext?.genre ? <div><strong>Genre:</strong> {releaseContext.genre}</div> : null}
                    {selectedRelease?.id === release.id && releaseContext?.style ? <div><strong>Style:</strong> {releaseContext.style}</div> : null}
                  </div>
                  {selectedRelease?.id === release.id && (
                    <>
                      {releaseCatalogInfoStatus ? <p className="hint">{releaseCatalogInfoStatus}</p> : null}
                      <div className="price-suggestions" aria-live="polite">
                        <strong>eBay active listings:</strong>
                        {ebayListingStatus ? <div>{ebayListingStatus}</div> : null}
                        {ebayListingStats?.sampledListingCount ? (
                          <div className={`ebay-listing-results ${ebayListingStats.searchMethod}`}>
                            <div><strong>Matching listings:</strong> {ebayListingStats.listingCount}</div>
                            <div className={`ebay-search-method ${ebayListingStats.searchMethod}`}><strong>Search used:</strong>{' '}
                              {ebayListingStats.searchMethod === 'catalogNumber' ? 'Discogs catalog number' : 'artist and album title'}
                            </div>
                            <div><strong>Priced sample:</strong> {ebayListingStats.sampledListingCount} active listings</div>
                            <div><strong>Low / average / high:</strong>{' '}
                              {ebayListingStats.currency || '$'} {ebayListingStats.lowestPrice?.toFixed(2)} /{' '}
                              {ebayListingStats.averagePrice?.toFixed(2)} / {ebayListingStats.highestPrice?.toFixed(2)}
                            </div>
                          </div>
                        ) : null}
                        {ebayListingStats ? <div className="price-note">Current asking prices only; not eBay sold-price history.</div> : null}
                      </div>
                      <div className="release-context-card" aria-live="polite">
                        {releaseContextStatus ? <p>{releaseContextStatus}</p> : null}
                        {releaseContext && (
                          <>
                            {releaseContext.artistProfile && releaseContext.descriptionSource !== 'artist' && (
                              <div>
                                <strong>Artist summary</strong>
                                <p className="artist-summary-preview"><span className="artist-summary-desktop">{formatDiscogsText(releaseContext.artistProfile)}</span><span className="artist-summary-mobile">{previewDiscogsText(formatDiscogsText(releaseContext.artistProfile))}</span></p>
                                <button type="button" className="artist-summary-show-all" onClick={() => setExpandedArtistSummary(formatDiscogsText(releaseContext.artistProfile!))}>Show all</button>
                              </div>
                            )}
                            <div>
                              <strong>
                                {releaseContext.descriptionSource === 'release'
                                  ? 'Release notes'
                                  : releaseContext.descriptionSource === 'album'
                                    ? 'Album notes'
                                    : releaseContext.descriptionSource === 'artist'
                                      ? 'Artist summary'
                                      : 'Discogs information'}
                              </strong>
                              <p className={releaseContext.descriptionSource === 'artist' ? 'artist-summary-preview' : undefined}>{releaseContext.description ? <>{releaseContext.descriptionSource === 'artist' ? <><span className="artist-summary-desktop">{formatDiscogsText(releaseContext.description)}</span><span className="artist-summary-mobile">{previewDiscogsText(formatDiscogsText(releaseContext.description))}</span></> : formatDiscogsText(releaseContext.description)}</> : 'Discogs does not provide release, album, or artist notes for this selection.'}</p>
                              {releaseContext.descriptionSource === 'artist' && releaseContext.description ? <button type="button" className="artist-summary-show-all" onClick={() => setExpandedArtistSummary(formatDiscogsText(releaseContext.description!))}>Show all</button> : null}
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
              <div><strong>Catalog number:</strong> {selectedRelease.catalogNumber || 'Not listed'}</div>
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

          <label>Media condition</label>
          <select value={mediaCondition} onChange={(e) => setMediaCondition(e.target.value)}>
            <option value="">Not specified</option>
            {MEDIA_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
          </select>

          <label>Estimated value</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={estimatedValueOverride}
            onChange={(e) => setEstimatedValueOverride(e.target.value)}
            placeholder="15.00"
          />

          {status ? <p className="status">{status}</p> : null}
          {entryBeingCorrected ? <div className="form-actions"><button type="button" className="secondary-button" onClick={cancelMatchCorrection}>Cancel correction</button></div> : null}
          <div className="form-actions"><button type="submit">{entryBeingCorrected ? 'Apply corrected match' : 'Add to Catalog'}</button></div>
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
        total={collectionTotal}
        start={collectionStart}
        end={collectionEnd}
        page={collectionPage}
        totalPages={collectionTotalPages}
        status={collectionStatus}
        hasOpenDetail={Boolean(viewedEntry)}
        onSearchChange={(value) => { setCollectionSearch(value); setCollectionPage(1); }}
        onOpenDetail={setViewedEntry}
        onChangeAssociation={beginMatchCorrection}
        onSearchEbay={(item) => { void openEbaySearch(item); }}
        onRemove={(item) => { void removeCatalogEntry(item); }}
        onPageChange={setCollectionPage}
      >
        {false && <>
        <div className="collection-toolbar">
          <input
            value={collectionSearch}
            onChange={(event) => {
              setCollectionSearch(event.target.value);
              setCollectionPage(1);
            }}
            placeholder="Search artist, album, catalog #, or barcode"
            aria-label="Search collection"
          />
          <span>{collectionTotal ? `Showing ${collectionStart}–${collectionEnd} of ${collectionTotal}` : 'No CDs found'}</span>
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
            }}
          >
          <section className="collection-detail" role="dialog" aria-modal="true" aria-label={`Details for ${viewedEntry.artist} — ${viewedEntry.title}`}>
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
                <details className="detail-action-menu">
                  <summary aria-label={`Actions for ${viewedEntry.artist} — ${viewedEntry.title}`} title="Catalog actions">•••</summary>
                  <div className="detail-action-menu-items">
                    <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void openEbaySearch(viewedEntry); }}>Open eBay listings</button>
                    <button type="button" className="secondary-button" disabled={!viewedEntry.discogsId} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); openDiscogsMarketplace(viewedEntry); }}>Open Discogs Marketplace</button>
                    <button type="button" className="secondary-button" disabled={!viewedEntry.discogsId && !viewedEntry.discogsUri} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); openDiscogsRelease(viewedEntry); }}>Open Discogs release</button>
                    <button type="button" className="secondary-button" disabled={!viewedEntry.discogsId} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void loadDetailImages(); }}>{showDetailImages ? 'Hide release images' : 'Show all release images'}</button>
                    <button type="button" className="secondary-button" disabled={!viewedEntry.discogsId} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void openTracklist(); }}>Show tracklist</button>
                    <button type="button" className="secondary-button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); beginCatalogDetailsEdit(); }}>Edit catalog details</button>
                    <button type="button" className="secondary-button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); beginEstimatedValueEdit(); }}>Update estimated value</button>
                    <button type="button" className="secondary-button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); beginMatchCorrection(viewedEntry); }}>Correct Discogs match</button>
                    <button type="button" className="danger-button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void removeCatalogEntry(viewedEntry); }}>Remove entry</button>
                  </div>
                </details>
                <button type="button" className="secondary-button" onClick={() => setViewedEntry(null)}>Close details</button>
              </div>
            </div>
            {detailStatus ? <p className="hint">{detailStatus}</p> : null}
            <div className="detail-grid">
              <div><strong>Label:</strong> {viewedEntry.label || 'Not listed'}</div>
              <div><strong>Country:</strong> {viewedEntry.country || 'Not listed'}</div>
              <div><strong>Catalog number:</strong> {viewedEntry.catalogNumber || 'Not listed'}</div>
              {viewedEntry.barcode ? <div><strong>Barcode:</strong> {viewedEntry.barcode}</div> : null}
              {viewedEntry.genre ? <div><strong>Genre:</strong> {viewedEntry.genre}</div> : null}
              {viewedEntry.style ? <div><strong>Style:</strong> {viewedEntry.style}</div> : null}
              <div><strong>Media condition:</strong> {viewedEntry.mediaCondition || 'Not specified'}</div>
              <div><strong>Estimated value:</strong> {viewedEntry.estimatedValue != null ? `$${viewedEntry.estimatedValue.toFixed(2)}` : 'Not set'}</div>
            </div>
            {editingCatalogDetails && catalogDetailsForm ? <form className="detail-section catalog-details-editor" onSubmit={saveCatalogDetails}>
              <strong>Edit catalog details</strong>
              <div className="catalog-details-fields">
                <label>Artist<input value={catalogDetailsForm.artist} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, artist: event.target.value })} /></label>
                <label>Album title<input value={catalogDetailsForm.title} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, title: event.target.value })} /></label>
                <label>Year<input type="number" min="1000" max="9999" value={catalogDetailsForm.year} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, year: event.target.value })} /></label>
                <label>Country<input value={catalogDetailsForm.country} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, country: event.target.value })} /></label>
                <label>Label<input value={catalogDetailsForm.label} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, label: event.target.value })} /></label>
                <label>Format<input value={catalogDetailsForm.format} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, format: event.target.value })} /></label>
                <label>Catalog number<input value={catalogDetailsForm.catalogNumber} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, catalogNumber: event.target.value })} /></label>
                <label>Barcode<input value={catalogDetailsForm.barcode} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, barcode: event.target.value })} /></label>
                <label>Media condition<select value={catalogDetailsForm.mediaCondition} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, mediaCondition: event.target.value })}><option value="">Not specified</option>{MEDIA_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}</select></label>
              </div>
              <label>Notes<textarea value={catalogDetailsForm.notes} onChange={(event) => setCatalogDetailsForm({ ...catalogDetailsForm, notes: event.target.value })} /></label>
              <div className="form-actions"><button type="submit">Save details</button><button type="button" className="secondary-button" onClick={() => { setEditingCatalogDetails(false); setCatalogDetailsForm(null); setCatalogDetailsStatus(''); }}>Cancel</button></div>
              {catalogDetailsStatus ? <p className="hint">{catalogDetailsStatus}</p> : null}
            </form> : null}
            {editingEstimatedValue ? <div className="detail-section estimated-value-editor"><strong>Update estimated value</strong><div className="inline-form"><input type="number" min="0" step="0.01" value={estimatedValueInput} onChange={(event) => setEstimatedValueInput(event.target.value)} placeholder="Leave blank to clear" aria-label="Estimated value" /><button type="button" onClick={() => void saveEstimatedValue()}>Save value</button><button type="button" className="secondary-button" onClick={() => { setEditingEstimatedValue(false); setEstimatedValueStatus(''); }}>Cancel</button></div>{estimatedValueStatus ? <p className="hint">{estimatedValueStatus}</p> : null}</div> : null}
            {viewedEntry.notes ? <div className="detail-section"><strong>Your notes</strong><p>{viewedEntry.notes}</p></div> : null}
            {detailContext?.artistProfile && detailContext.descriptionSource !== 'artist' ? <div className="detail-section"><strong>Artist summary</strong><p className="artist-summary-preview"><span className="artist-summary-desktop">{formatDiscogsText(detailContext.artistProfile)}</span><span className="artist-summary-mobile">{previewDiscogsText(formatDiscogsText(detailContext.artistProfile))}</span></p><button type="button" className="artist-summary-show-all" onClick={() => setExpandedArtistSummary(formatDiscogsText(detailContext.artistProfile!))}>Show all</button></div> : null}
            {detailContext ? <div className="detail-section"><strong>{detailContext.descriptionSource === 'release' ? 'Release notes' : detailContext.descriptionSource === 'album' ? 'Album notes' : 'Artist summary'}</strong><p className={detailContext.descriptionSource === 'artist' ? 'artist-summary-preview' : undefined}>{detailContext.description ? <>{detailContext.descriptionSource === 'artist' ? <><span className="artist-summary-desktop">{formatDiscogsText(detailContext.description)}</span><span className="artist-summary-mobile">{previewDiscogsText(formatDiscogsText(detailContext.description))}</span></> : formatDiscogsText(detailContext.description)}</> : 'No additional Discogs notes are available.'}</p>{detailContext.descriptionSource === 'artist' && detailContext.description ? <button type="button" className="artist-summary-show-all" onClick={() => setExpandedArtistSummary(formatDiscogsText(detailContext.description!))}>Show all</button> : null}</div> : null}
            {detailEbayStats?.sampledListingCount ? <div className={`detail-section ebay-listing-results ${detailEbayStats.searchMethod}`}><strong>eBay active listings</strong><p>{detailEbayStats.listingCount} listings found • {detailEbayStats.searchMethod === 'catalogNumber' ? 'catalog number match' : 'artist/title CD search'} • Low / average / high: {detailEbayStats.currency || '$'} {detailEbayStats.lowestPrice?.toFixed(2)} / {detailEbayStats.averagePrice?.toFixed(2)} / {detailEbayStats.highestPrice?.toFixed(2)}</p></div> : null}
            {showDetailImages ? (
              <div className="detail-section release-image-gallery">
                <strong>Release images</strong>
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
                  <div className="tracklist-header">
                    <div><h3>Tracklist</h3><p>{viewedEntry.artist} — {viewedEntry.title}</p></div>
                    <button type="button" className="secondary-button" onClick={() => setShowTracklist(false)}>Back to details</button>
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
                            <button type="button" onClick={() => void chooseYouTubeMatch(youTubeCandidates.track, video)}>Use this match</button>
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
                        <div className="youtube-player-header">
                          <strong>{youTubePlayer.title}</strong>
                          <button type="button" className="secondary-button" onClick={() => setYouTubePlayer(null)}>Close</button>
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
                          <div className="track-actions">
                            <button type="button" onClick={() => personalMatch ? playLocalCopy(personalMatch) : void findPersonalCopy(track)}>{personalMatch ? 'Play local copy' : 'Find personal copy'}</button>
                            {savedMatch ? <button type="button" onClick={() => { setLocalAudioPlayer(null); setYouTubePlayer({ videoId: savedMatch.videoId, title: savedMatch.videoTitle, watchUrl: savedMatch.videoUrl }); }}>Play saved match</button> : null}
                            <button type="button" className="secondary-button" onClick={() => void findYouTubeMatches(track)}>{savedMatch ? 'Change match' : 'Find matches'}</button>
                            <button type="button" className="secondary-button" onClick={() => openTrackOnYouTube(track)}>Search</button>
                          </div>
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
                    }}>View details</button>
                    <button type="button" className="secondary-button" onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      beginMatchCorrection(item);
                    }}>Change association</button>
                    <button type="button" className="secondary-button" onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      void openEbaySearch(item);
                    }}>Search eBay</button>
                    <button type="button" className="danger-button" onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      void removeCatalogEntry(item);
                    }}>Remove entry</button>
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>
        {collectionTotalPages > 1 && (
          <nav className="pagination collection-pagination" aria-label="Collection pages">
            <button type="button" onClick={() => setCollectionPage((page) => page - 1)} disabled={collectionPage === 1}>Previous</button>
            <span>Page {collectionPage} of {collectionTotalPages}</span>
            <button type="button" onClick={() => setCollectionPage((page) => page + 1)} disabled={collectionPage === collectionTotalPages}>Next</button>
          </nav>
        )}
      </>}
      </CatalogPage>
      {localAudioPlayer ? <LocalAudioPlayer {...localAudioPlayer} onClose={() => setLocalAudioPlayer(null)} onError={() => setPersonalMusicStatus('This local file could not be played. It may have been moved or renamed since the last scan; open Music Library and scan again.')} /> : null}
      {expandedArtistSummary ? <ArtistSummaryDialog summary={expandedArtistSummary} onClose={() => setExpandedArtistSummary(null)} /> : null}
      {personalTrackNotFoundPrompt ? <div className="artist-summary-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPersonalTrackNotFoundPrompt(null); }}><section className="artist-summary-dialog" role="dialog" aria-modal="true" aria-label="Personal music match not found"><div className="artist-summary-dialog-header"><h2>No personal match found</h2><button type="button" className="secondary-button" onClick={() => setPersonalTrackNotFoundPrompt(null)}>No</button></div><p>No tagged local match was found for <strong>{personalTrackNotFoundPrompt.title}</strong>. If you believe the track is in your scanned music collection, you can make a manual album-folder match.</p><div className="form-actions"><button type="button" onClick={beginManualPersonalAlbumMatch}>Yes, make manual match</button><button type="button" className="secondary-button" onClick={() => setPersonalTrackNotFoundPrompt(null)}>No, not now</button></div></section></div> : null}
      {showPersonalFolderMapping ? <div className="artist-summary-overlay" role="presentation"><section className="artist-summary-dialog" role="dialog" aria-modal="true" aria-label="Manual personal album match"><div className="artist-summary-dialog-header"><h2>Manual personal album match</h2><button type="button" className="secondary-button" onClick={() => setShowPersonalFolderMapping(false)}>Cancel</button></div>{personalAlbumValidation === 'invalid' ? <><p>Cannot make one-to-one track associations for this folder.</p><div className="form-actions"><button type="button" onClick={() => setShowPersonalFolderMapping(false)}>OK</button></div></> : <><p>Select the base artist folder and then the album folder. The app will validate every track before enabling Save.</p><label>Artist folder<select value={selectedPersonalArtistFolderPath} onChange={(event) => void browsePersonalAlbumFolders(event.target.value)} disabled={!personalArtistFolders}><option value="">{personalArtistFolders ? 'Choose artist folder' : 'Loading artist folders...'}</option>{personalArtistFolders?.map((folder) => <option key={folder.folderPath} value={folder.folderPath}>{folder.name} ({folder.trackCount} tracks)</option>)}</select></label><label>Album folder<select value={selectedPersonalAlbumFolderPath} onChange={(event) => void validatePersonalAlbumFolder(event.target.value)} disabled={!selectedPersonalArtistFolderPath || !personalBrowsableAlbumFolders || personalAlbumValidation === 'checking'}><option value="">{selectedPersonalArtistFolderPath ? 'Choose album folder' : 'Choose an artist first'}</option>{personalBrowsableAlbumFolders?.map((folder) => <option key={folder.folderPath} value={folder.folderPath}>{folder.album || folder.name} ({folder.trackCount} tracks)</option>)}</select></label>{personalAlbumMappingStatus ? <p className="hint">{personalAlbumMappingStatus}</p> : null}<div className="form-actions"><button type="button" disabled={personalAlbumValidation !== 'valid'} onClick={() => void savePersonalAlbumFolder(selectedPersonalAlbumFolderPath)}>Save mapping</button><button type="button" className="secondary-button" onClick={() => setShowPersonalFolderMapping(false)}>Cancel</button></div></>}</section></div> : null}
        </>
      )}
      </main>
    </div>
  );
}

export default App;
