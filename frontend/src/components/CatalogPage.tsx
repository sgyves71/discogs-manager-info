import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CdEntry } from '../types';

type CatalogPageProps = {
  items: CdEntry[];
  search: string;
  total: number;
  isLoading: boolean;
  hasMoreItems: boolean;
  status: string;
  sort: 'artist' | 'discogs-median-desc' | 'estimated-value-desc';
  hasOpenDetail: boolean;
  onSearchChange: (value: string) => void;
  onSortChange: (value: 'artist' | 'discogs-median-desc' | 'estimated-value-desc') => void;
  onOpenDetail: (item: CdEntry) => void;
  onChangeAssociation: (item: CdEntry) => void;
  onSearchEbay: (item: CdEntry) => void;
  onRemove: (item: CdEntry) => void;
  onLoadMore: () => void;
  children?: ReactNode;
};

export function CatalogPage({
  items, search, total, isLoading, hasMoreItems, status, sort, hasOpenDetail,
  onSearchChange, onSortChange, onOpenDetail, onChangeAssociation, onSearchEbay, onRemove, onLoadMore, children,
}: CatalogPageProps) {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const coverUrl = (item: CdEntry) => `/api/cds/${item.id}/cover${item.coverImageUpdatedAt ? `?updated=${encodeURIComponent(item.coverImageUpdatedAt)}` : ''}`;
  const showsMedian = sort === 'discogs-median-desc';
  const showsEstimatedValue = sort === 'estimated-value-desc';
  const medianLabel = (item: CdEntry) => item.discogsMarketMedian != null
    ? `${item.discogsMarketCurrency === 'USD' || !item.discogsMarketCurrency ? '$' : `${item.discogsMarketCurrency} `}${item.discogsMarketMedian.toFixed(2)}`
    : 'Not Available';

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMoreItems || isLoading) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onLoadMore();
    }, { rootMargin: '480px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreItems, isLoading, onLoadMore]);

  useEffect(() => {
    if (openMenuId == null) return;
    const closeMenuWhenClickingElsewhere = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.row-menu')) setOpenMenuId(null);
    };
    document.addEventListener('pointerdown', closeMenuWhenClickingElsewhere);
    return () => document.removeEventListener('pointerdown', closeMenuWhenClickingElsewhere);
  }, [openMenuId]);

  const renderActions = (item: CdEntry) => (
    <div className="collection-actions" onClick={(event) => event.stopPropagation()}>
      <div className="row-menu">
        <button type="button" className="row-menu-trigger" aria-label={`Actions for ${item.artist} — ${item.title}`} aria-expanded={openMenuId === item.id} onClick={() => setOpenMenuId((current) => current === item.id ? null : item.id)}>•••</button>
        {openMenuId === item.id ? <div className="row-menu-items">
          <button type="button" onClick={() => { setOpenMenuId(null); if (!hasOpenDetail) onOpenDetail(item); }}>View Details</button>
          <button type="button" className="secondary-button" onClick={() => { setOpenMenuId(null); onChangeAssociation(item); }}>Change Association</button>
          <button type="button" className="secondary-button" onClick={() => { setOpenMenuId(null); onSearchEbay(item); }}>Search eBay</button>
          <button type="button" className="danger-button" onClick={() => { setOpenMenuId(null); onRemove(item); }}>Remove Entry</button>
        </div> : null}
      </div>
    </div>
  );

  return (
    <>
      <h1>Catalog</h1>
      <p>Browse, filter, inspect, and correct the Discogs association for your saved CDs.</p>
      <div className="card">
        <h2>Your collection</h2>
        <div className="collection-toolbar">
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search Artist, Album, Catalog #, or Barcode" aria-label="Search Collection" />
          <div className="collection-toolbar-meta">
            <span>{total ? `Showing ${items.length} of ${total}` : 'No CDs found'}</span>
            <label className="collection-sort">Sort<select value={sort} onChange={(event) => onSortChange(event.target.value as typeof sort)} aria-label="Sort Catalog">
              <option value="artist">Artist (A-Z)</option>
              <option value="discogs-median-desc">Discogs Median (High to Low)</option>
              <option value="estimated-value-desc">Estimated Value (High to Low)</option>
            </select></label>
            <div className="collection-view-toggle" aria-label="Catalog view">
              <button type="button" className={viewMode === 'list' ? 'is-active' : 'secondary-button'} onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'}>List View</button>
              <button type="button" className={viewMode === 'grid' ? 'is-active' : 'secondary-button'} onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'}>Cover Grid</button>
            </div>
          </div>
        </div>
        {status ? <p className="hint collection-status" aria-live="polite">{status}</p> : null}
        {viewMode === 'list' ? <div className="collection-column-headings" aria-hidden="true"><span /><span>Artist</span><span>Album</span><span>{showsMedian ? 'Discogs Median' : showsEstimatedValue ? 'Estimated Value' : 'Year'}</span><span>Menu</span></div> : null}
        {children}
        {viewMode === 'list' ? <ul className="collection-list">
          {items.map((item) => (
            <li key={item.id} className="collection-item" role="button" tabIndex={0} onClick={() => { if (!hasOpenDetail) onOpenDetail(item); }} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!hasOpenDetail) onOpenDetail(item); }
            }}>
              <div className="collection-cover">{item.hasCover ? <img src={coverUrl(item)} alt="" /> : <span aria-hidden="true">♫</span>}</div>
              <div className="collection-summary"><div><span>Artist</span><strong>{item.artist}</strong></div><div><span>Album</span><strong>{item.title}</strong></div><div><span>{showsMedian ? 'Discogs Median' : showsEstimatedValue ? 'Estimated Value' : 'Year'}</span><strong>{showsMedian ? medianLabel(item) : showsEstimatedValue ? (item.estimatedValue != null ? `$${item.estimatedValue.toFixed(2)}` : 'Not Set') : item.year ?? 'Unknown'}</strong></div></div>
              {renderActions(item)}
            </li>
          ))}
        </ul> : <div className="catalog-cover-grid">
          {items.map((item) => (
            <article key={item.id} className="catalog-cover-grid-item" role="button" tabIndex={0} onClick={() => { if (!hasOpenDetail) onOpenDetail(item); }} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!hasOpenDetail) onOpenDetail(item); }
            }}>
              <div className="catalog-cover-grid-image">{item.hasCover ? <img src={coverUrl(item)} alt={`Cover art for ${item.title}`} /> : <span aria-hidden="true">♫</span>}</div>
              <div className="catalog-cover-grid-caption"><strong>{item.artist}</strong><span>{item.title}</span></div>
              {renderActions(item)}
            </article>
          ))}
        </div>}
        <div className="collection-load-more" ref={loadMoreSentinelRef} data-testid="collection-load-more-sentinel" aria-live="polite">
          {isLoading ? 'Loading more albums…' : hasMoreItems ? 'Scroll to load more albums…' : total ? `All ${total} albums loaded.` : null}
        </div>
      </div>
    </>
  );
}
