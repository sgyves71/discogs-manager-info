import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CdEntry } from '../types';

type CatalogPageProps = {
  items: CdEntry[];
  search: string;
  total: number;
  isLoading: boolean;
  hasMoreItems: boolean;
  status: string;
  hasOpenDetail: boolean;
  onSearchChange: (value: string) => void;
  onOpenDetail: (item: CdEntry) => void;
  onChangeAssociation: (item: CdEntry) => void;
  onSearchEbay: (item: CdEntry) => void;
  onRemove: (item: CdEntry) => void;
  onLoadMore: () => void;
  children?: ReactNode;
};

export function CatalogPage({
  items, search, total, isLoading, hasMoreItems, status, hasOpenDetail,
  onSearchChange, onOpenDetail, onChangeAssociation, onSearchEbay, onRemove, onLoadMore, children,
}: CatalogPageProps) {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const coverUrl = (item: CdEntry) => `/api/cds/${item.id}/cover${item.coverImageUpdatedAt ? `?updated=${encodeURIComponent(item.coverImageUpdatedAt)}` : ''}`;

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMoreItems || isLoading) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onLoadMore();
    }, { rootMargin: '480px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreItems, isLoading, onLoadMore]);

  const renderActions = (item: CdEntry) => (
    <div className="collection-actions" onClick={(event) => event.stopPropagation()}>
      <details className="row-menu">
        <summary aria-label={`Actions for ${item.artist} — ${item.title}`}>•••</summary>
        <div className="row-menu-items">
          <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); if (!hasOpenDetail) onOpenDetail(item); }}>View Details</button>
          <button type="button" className="secondary-button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onChangeAssociation(item); }}>Change Association</button>
          <button type="button" className="secondary-button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onSearchEbay(item); }}>Search eBay</button>
          <button type="button" className="danger-button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onRemove(item); }}>Remove Entry</button>
        </div>
      </details>
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
            <div className="collection-view-toggle" aria-label="Catalog view">
              <button type="button" className={viewMode === 'list' ? 'is-active' : 'secondary-button'} onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'}>List View</button>
              <button type="button" className={viewMode === 'grid' ? 'is-active' : 'secondary-button'} onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'}>Cover Grid</button>
            </div>
          </div>
        </div>
        {status ? <p className="hint collection-status" aria-live="polite">{status}</p> : null}
        {viewMode === 'list' ? <div className="collection-column-headings" aria-hidden="true"><span /><span>Artist</span><span>Album</span><span>Year</span><span>Menu</span></div> : null}
        {children}
        {viewMode === 'list' ? <ul className="collection-list">
          {items.map((item) => (
            <li key={item.id} className="collection-item" role="button" tabIndex={0} onClick={() => { if (!hasOpenDetail) onOpenDetail(item); }} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!hasOpenDetail) onOpenDetail(item); }
            }}>
              <div className="collection-cover">{item.hasCover ? <img src={coverUrl(item)} alt="" /> : <span aria-hidden="true">♫</span>}</div>
              <div className="collection-summary"><div><span>Artist</span><strong>{item.artist}</strong></div><div><span>Album</span><strong>{item.title}</strong></div><div><span>Year</span><strong>{item.year ?? 'Unknown'}</strong></div></div>
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
