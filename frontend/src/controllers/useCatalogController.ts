import { useEffect, useRef, useState } from 'react';
import type { CatalogStatistics, CdEntry } from '../types';

export type CatalogSort = 'artist' | 'discogs-median-desc' | 'estimated-value-desc';
type ActivePage = 'search' | 'catalog' | 'library' | 'statistics';
const COLLECTION_BATCH_SIZE = 50;

export function useCatalogController(activePage: ActivePage) {
  const [items, setItems] = useState<CdEntry[]>([]);
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState('');
  const [styleOptions, setStyleOptions] = useState<string[]>([]);
  const [sort, setSort] = useState<CatalogSort>('artist');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [status, setStatus] = useState('');
  const [statistics, setStatistics] = useState<CatalogStatistics | null>(null);
  const [statisticsStatus, setStatisticsStatus] = useState('');
  const loadInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(COLLECTION_BATCH_SIZE), sort });
      if (search.trim()) params.set('q', search.trim());
      if (style) params.set('style', style);
      fetch(`/api/cds?${params.toString()}`)
        .then((response) => response.json())
        .then((data: { items?: CdEntry[]; total?: number }) => {
          if (cancelled) return;
          const nextItems = data.items ?? [];
          setItems((current) => page === 1 ? nextItems : [
            ...current,
            ...nextItems.filter((nextItem) => !current.some((item) => item.id === nextItem.id)),
          ]);
          setTotal(data.total ?? 0);
        })
        .catch(() => {
          if (!cancelled && page === 1) { setItems([]); setTotal(0); }
        })
        .finally(() => {
          if (!cancelled) { loadInFlightRef.current = false; setLoading(false); }
        });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [page, refreshToken, search, sort, style]);

  useEffect(() => {
    if (activePage !== 'catalog') return;
    let cancelled = false;
    fetch('/api/catalog/styles')
      .then((response) => response.ok ? response.json() as Promise<{ styles?: string[] }> : { styles: [] })
      .then((data) => { if (!cancelled) setStyleOptions(data.styles ?? []); })
      .catch(() => { if (!cancelled) setStyleOptions([]); });
    return () => { cancelled = true; };
  }, [activePage]);

  useEffect(() => {
    if (activePage !== 'statistics') return;
    let cancelled = false;
    fetch('/api/catalog/statistics')
      .then((response) => response.json())
      .then((data: CatalogStatistics) => { if (!cancelled) setStatistics(data); })
      .catch(() => { if (!cancelled) setStatisticsStatus('Unable to load catalog statistics.'); });
    return () => { cancelled = true; };
  }, [activePage, refreshToken]);

  return {
    items, setItems, search, setSearch, style, setStyle, styleOptions, sort, setSort,
    page, setPage, total, setTotal, loading, refresh: () => setRefreshToken((value) => value + 1),
    setRefreshToken, status, setStatus, statistics, statisticsStatus, loadInFlightRef,
    hasMoreItems: items.length < total,
  };
}

export type CatalogController = ReturnType<typeof useCatalogController>;
