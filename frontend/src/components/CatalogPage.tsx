import type { ReactNode } from 'react';
import type { CdEntry } from '../types';

type CatalogPageProps = {
  items: CdEntry[];
  search: string;
  total: number;
  start: number;
  end: number;
  page: number;
  totalPages: number;
  status: string;
  hasOpenDetail: boolean;
  onSearchChange: (value: string) => void;
  onOpenDetail: (item: CdEntry) => void;
  onChangeAssociation: (item: CdEntry) => void;
  onSearchEbay: (item: CdEntry) => void;
  onRemove: (item: CdEntry) => void;
  onPageChange: (page: number) => void;
  children?: ReactNode;
};

export function CatalogPage({
  items, search, total, start, end, page, totalPages, status, hasOpenDetail,
  onSearchChange, onOpenDetail, onChangeAssociation, onSearchEbay, onRemove, onPageChange, children,
}: CatalogPageProps) {
  return (
    <>
      <h1>Catalog</h1>
      <p>Browse, filter, inspect, and correct the Discogs association for your saved CDs.</p>
      <div className="card">
        <h2>Your collection</h2>
        <div className="collection-toolbar">
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search artist, album, catalog #, or barcode" aria-label="Search collection" />
          <span>{total ? `Showing ${start}–${end} of ${total}` : 'No CDs found'}</span>
        </div>
        {status ? <p className="hint collection-status" aria-live="polite">{status}</p> : null}
        <div className="collection-column-headings" aria-hidden="true"><span /><span>Artist</span><span>Album</span><span>Year</span><span>Menu</span></div>
        {children}
        <ul className="collection-list">
          {items.map((item) => (
            <li key={item.id} className="collection-item" role="button" tabIndex={0} onClick={() => { if (!hasOpenDetail) onOpenDetail(item); }} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!hasOpenDetail) onOpenDetail(item); }
            }}>
              <div className="collection-cover">{item.hasCover ? <img src={`/api/cds/${item.id}/cover`} alt="" /> : <span aria-hidden="true">♫</span>}</div>
              <div className="collection-summary"><div><span>Artist</span><strong>{item.artist}</strong></div><div><span>Album</span><strong>{item.title}</strong></div><div><span>Year</span><strong>{item.year ?? 'Unknown'}</strong></div></div>
              <div className="collection-actions" onClick={(event) => event.stopPropagation()}>
                <details className="row-menu">
                  <summary aria-label={`Actions for ${item.artist} — ${item.title}`}>•••</summary>
                  <div className="row-menu-items">
                    <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); if (!hasOpenDetail) onOpenDetail(item); }}>View details</button>
                    <button type="button" className="secondary-button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onChangeAssociation(item); }}>Change association</button>
                    <button type="button" className="secondary-button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onSearchEbay(item); }}>Search eBay</button>
                    <button type="button" className="danger-button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onRemove(item); }}>Remove entry</button>
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>
        {totalPages > 1 ? <nav className="pagination collection-pagination" aria-label="Collection pages"><button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1}>Previous</button><span>Page {page} of {totalPages}</span><button type="button" onClick={() => onPageChange(page + 1)} disabled={page === totalPages}>Next</button></nav> : null}
      </div>
    </>
  );
}
