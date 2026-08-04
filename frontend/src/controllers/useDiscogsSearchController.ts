import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiscogsResult } from '../types';
import type { DiscogsMarketStats, DiscogsReleaseContext, EBayActiveListingStats } from './useCatalogDetailController';

const RESULTS_PER_PAGE = 20;

export function useDiscogsSearchController() {
  const [artist, setArtist] = useState('');
  const [albumTitle, setAlbumTitle] = useState('');
  const [catalogNumber, setCatalogNumber] = useState('');
  const [barcode, setBarcode] = useState('');
  const [results, setResults] = useState<DiscogsResult[]>([]);
  const [coverImages, setCoverImages] = useState<Record<number, string | null>>({});
  const [selectedRelease, setSelectedRelease] = useState<DiscogsResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [countryFilter, setCountryFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const requestedCoverIds = useRef(new Set<number>());
  const detailsCache = useRef(new Map<number, { release: DiscogsResult; catalogInfoLoaded?: boolean; context?: DiscogsReleaseContext; ebay?: { stats: EBayActiveListingStats; status: string }; marketStats?: { stats: DiscogsMarketStats; status: string } }>());
  const [catalogInfoStatus, setCatalogInfoStatus] = useState('');

  const summary = useMemo(() => {
    const description = [
      [artist.trim(), albumTitle.trim()].filter(Boolean).join(' — '),
      catalogNumber.trim() ? `Catalog # ${catalogNumber.trim()}` : '',
      barcode.trim() ? `Barcode ${barcode.trim()}` : '',
    ].filter(Boolean).join(' | ');
    if (!description) return 'Enter an artist and album title to look up Discogs releases.';
    if (!hasSearched) return `Search Discogs for “${description}”.`;
    if (results.length === 0) return `No Discogs matches found for “${description}”.`;
    return `Showing ${results.length} Discogs ${results.length === 1 ? 'match' : 'matches'} for “${description}”.`;
  }, [albumTitle, artist, barcode, catalogNumber, hasSearched, results.length]);

  const availableCountries = useMemo(() => Array.from(new Set(
    results.map((result) => result.country?.trim()).filter((country): country is string => Boolean(country)),
  )).sort((left, right) => left.localeCompare(right)), [results]);
  const filteredResults = useMemo(() => countryFilter
    ? results.filter((result) => result.country?.trim() === countryFilter)
    : results, [countryFilter, results]);
  const totalPages = Math.ceil(filteredResults.length / RESULTS_PER_PAGE);
  const visibleResults = useMemo(() => {
    const start = (currentPage - 1) * RESULTS_PER_PAGE;
    return filteredResults.slice(start, start + RESULTS_PER_PAGE);
  }, [currentPage, filteredResults]);

  useEffect(() => {
    const missingCovers = visibleResults.filter(
      (release) => !release.coverImage && !release.thumb && !requestedCoverIds.current.has(release.id),
    );
    if (!missingCovers.length) return;
    missingCovers.forEach((release) => requestedCoverIds.current.add(release.id));
    void Promise.all(missingCovers.map(async (release) => {
      try {
        const response = await fetch(`/api/discogs/releases/${release.id}/cover`);
        const data = await response.json() as { coverImage?: string | null };
        setCoverImages((current) => ({ ...current, [release.id]: data.coverImage ?? null }));
      } catch {
        setCoverImages((current) => ({ ...current, [release.id]: null }));
      }
    }));
  }, [visibleResults]);

  const searchDiscogs = async (scannedBarcode?: string) => {
    const values = { artist: artist.trim(), title: albumTitle.trim(), catno: catalogNumber.trim(), barcode: scannedBarcode ?? barcode.trim() };
    if (!Object.values(values).some(Boolean)) return;
    setLoading(true); setHasSearched(true); setCurrentPage(1); setCountryFilter(''); setStatus('Searching Discogs...');
    try {
      const params = new URLSearchParams();
      Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
      const response = await fetch(`/api/discogs/search?${params.toString()}`);
      const data = await response.json();
      const normalized = (Array.isArray(data) ? data : []).sort((left: DiscogsResult, right: DiscogsResult) => left.year == null ? (right.year == null ? 0 : 1) : right.year == null ? -1 : left.year - right.year);
      setResults(normalized); setCoverImages({}); requestedCoverIds.current.clear(); detailsCache.current.clear(); setSelectedRelease(null); setCatalogInfoStatus('');
      setStatus(normalized.length ? 'Choose the version you own.' : 'No matches found.');
    } catch { setResults([]); setSelectedRelease(null); setCatalogInfoStatus(''); setStatus('Search failed. Please try again.'); }
    finally { setLoading(false); }
  };

  const clear = () => {
    setArtist(''); setAlbumTitle(''); setCatalogNumber(''); setBarcode(''); setResults([]); setCoverImages({});
    requestedCoverIds.current.clear(); detailsCache.current.clear(); setSelectedRelease(null); setCatalogInfoStatus('');
    setCountryFilter(''); setHasSearched(false); setCurrentPage(1); setStatus('Search cleared.');
  };

  const selectRelease = async (release: DiscogsResult) => {
    if (selectedRelease?.id === release.id) return;
    const cached = detailsCache.current.get(release.id);
    if (cached?.catalogInfoLoaded) { setSelectedRelease(cached.release); setCatalogInfoStatus('Release-specific label, catalog number, and barcode loaded from this search.'); return; }
    setSelectedRelease(release); setCatalogInfoStatus('Loading release-specific label, catalog number, and barcode...');
    try {
      const response = await fetch(`/api/discogs/releases/${release.id}/catalog-info`);
      const data = await response.json() as { label?: string | null; catalogNumber?: string | null; barcode?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load release-specific information.');
      const enriched = { ...release, label: data.label ?? release.label, catalogNumber: data.catalogNumber ?? release.catalogNumber, barcode: data.barcode ?? null };
      setResults((current) => current.map((item) => item.id === release.id ? enriched : item));
      if (cached) { cached.release = enriched; cached.catalogInfoLoaded = true; } else detailsCache.current.set(release.id, { release: enriched, catalogInfoLoaded: true });
      setSelectedRelease((current) => current?.id === release.id ? enriched : current); setCatalogInfoStatus('Release-specific label, catalog number, and barcode loaded.');
    } catch (error) { setCatalogInfoStatus(error instanceof Error ? `${error.message} Showing the search-result details instead.` : 'Unable to load release-specific information. Showing the search-result details instead.'); }
  };

  return {
    artist, setArtist, albumTitle, setAlbumTitle, catalogNumber, setCatalogNumber, barcode, setBarcode,
    results, setResults, coverImages, setCoverImages, selectedRelease, setSelectedRelease,
    hasSearched, setHasSearched, currentPage, setCurrentPage, countryFilter, setCountryFilter,
    loading, setLoading, status, setStatus, summary, availableCountries, totalPages, visibleResults,
    catalogInfoStatus, setCatalogInfoStatus, detailsCache, searchDiscogs, clear, selectRelease,
    resetCoverCache: () => { setCoverImages({}); requestedCoverIds.current.clear(); },
  };
}

export type DiscogsSearchController = ReturnType<typeof useDiscogsSearchController>;
