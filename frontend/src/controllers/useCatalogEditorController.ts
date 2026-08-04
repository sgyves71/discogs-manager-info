import { useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import type { CatalogController } from './useCatalogController';
import type { CatalogDetailController } from './useCatalogDetailController';
import type { DiscogsSearchController } from './useDiscogsSearchController';
import type { CdEntry } from '../types';
import { cleanExternalSearchText } from '../utils/catalog';
import type { EBayActiveListingStats } from './useCatalogDetailController';

type ActivePage = 'search' | 'catalog' | 'library' | 'statistics';
type Dependencies = { catalog: CatalogController; detail: CatalogDetailController; search: DiscogsSearchController; setActivePage: Dispatch<SetStateAction<ActivePage>> };

export function useCatalogEditorController({ catalog, detail, search, setActivePage }: Dependencies) {
  const { setItems, setTotal: setCollectionTotal, setRefreshToken: setCollectionRefresh, setStatus: setCollectionStatus } = catalog;
  const { selectedRelease, setSelectedRelease, setResults, setArtist: setSearchArtist, setAlbumTitle: setSearchAlbumTitle, setCatalogNumber: setSearchCatalogNumber, setBarcode: setSearchBarcode, setCatalogInfoStatus: setReleaseCatalogInfoStatus, setStatus, setHasSearched, setCurrentPage } = search;
  const { viewedEntry, setViewedEntry, setEditingEstimatedValue, setEditingCatalogDetails, catalogDetailsForm, setCatalogDetailsForm, setCatalogDetailsStatus, estimatedValueInput, setEstimatedValueInput, setEstimatedValueStatus } = detail;
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [notes, setNotes] = useState('');
  const [mediaCondition, setMediaCondition] = useState('Very Good Plus (VG+)');
  const [estimatedValueOverride, setEstimatedValueOverride] = useState('15.00');
  const [hasEstimatedValueOverride, setHasEstimatedValueOverride] = useState(false);
  const [entryBeingCorrected, setEntryBeingCorrected] = useState<CdEntry | null>(null);
  const [catalogSaveAction, setCatalogSaveAction] = useState<string | null>(null);
  const [catalogSaveError, setCatalogSaveError] = useState<string | null>(null);
  const catalogSaveInFlightRef = useRef(false);

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
    window.setTimeout(() => document.querySelector('.search-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
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


  return {
    title,setTitle,artist,setArtist,notes,setNotes,mediaCondition,setMediaCondition,
    estimatedValueOverride,setEstimatedValueOverride,hasEstimatedValueOverride,setHasEstimatedValueOverride,
    entryBeingCorrected,setEntryBeingCorrected,catalogSaveAction,setCatalogSaveAction,
    catalogSaveError,setCatalogSaveError,catalogSaveInFlightRef,
    handleSave,beginMatchCorrection,cancelMatchCorrection,openEbaySearch,removeCatalogEntry,
    beginEstimatedValueEdit,saveEstimatedValue,beginCatalogDetailsEdit,saveCatalogDetails,
  };
}
