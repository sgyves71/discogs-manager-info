import { useEffect, useState } from 'react';
import type { CatalogDetailController, DiscogsMarketStats, DiscogsReleaseContext, EBayActiveListingStats, MusicBrainzCatalogContext } from './useCatalogDetailController';
import type { DiscogsSearchController } from './useDiscogsSearchController';
import type { PersonalTrackMatch, SavedYouTubeTrackMatch } from '../types';
import { catalogCoverUrl } from '../utils/catalog';

export function useCatalogContextController(search: DiscogsSearchController, detail: CatalogDetailController) {
  const { selectedRelease, detailsCache: searchReleaseDetailsCache } = search;
  const {
    viewedEntry, setDetailCoverImage, setDetailContext, setDetailMusicBrainzContext, setDetailEbayStats,
    setDetailStatus, setEditingEstimatedValue, setEstimatedValueInput, setEstimatedValueStatus,
    setEditingCatalogDetails, setCatalogDetailsForm, setCatalogDetailsStatus, setDetailImages,
    setDetailImagesStatus, setShowDetailImages, setDetailTracks, setDetailTracksStatus, setShowTracklist,
    setDetailActionMenuOpen, setYouTubeStatus, setYouTubeCandidates, setSavedYouTubeMatches,
    setYouTubePlayer, setPersonalTrackMatches, setPersonalMusicStatus, setPersonalArtistFolders,
    setPersonalBrowsableAlbumFolders, setShowPersonalFolderMapping, setPersonalTrackNotFoundPrompt,
    setSelectedPersonalArtistFolderPath, setSelectedPersonalAlbumFolderPath, setPersonalAlbumValidation,
    setPersonalAlbumMappingStatus,
  } = detail;
  const [ebayListingStats, setEbayListingStats] = useState<EBayActiveListingStats | null>(null);
  const [ebayListingStatus, setEbayListingStatus] = useState('');
  const [includeEbayAuctionValues, setIncludeEbayAuctionValues] = useState(true);
  const [discogsSearchMarketStats, setDiscogsSearchMarketStats] = useState<DiscogsMarketStats | null>(null);
  const [discogsSearchMarketStatsStatus, setDiscogsSearchMarketStatsStatus] = useState('');
  const [includeDiscogsMarketStats, setIncludeDiscogsMarketStats] = useState(true);
  const [releaseContext, setReleaseContext] = useState<DiscogsReleaseContext | null>(null);
  const [releaseContextStatus, setReleaseContextStatus] = useState('');

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


  return {
    ebayListingStats,setEbayListingStats,ebayListingStatus,setEbayListingStatus,
    includeEbayAuctionValues,setIncludeEbayAuctionValues,discogsSearchMarketStats,
    discogsSearchMarketStatsStatus,includeDiscogsMarketStats,setIncludeDiscogsMarketStats,
    releaseContext,setReleaseContext,releaseContextStatus,setReleaseContextStatus,
  };
}

