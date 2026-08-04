type SearchRelease = { id: number; title: string; artist: string; year: number | null; country: string | null; label: string | null; format: string; thumb: string | null; coverImage: string | null; catalogNumber: string | null; barcode: string | null };
type ReleaseContext = { description: string | null; descriptionSource: 'release' | 'album' | 'artist' | null; genre: string | null; style: string | null };
type MarketStats = { low: number | null; median: number | null; high: number | null; currency: string | null };
type EbayStats = { listingCount: number; sampledListingCount: number; lowestPrice: number | null; averagePrice: number | null; highestPrice: number | null; currency: string | null; searchMethod: 'catalogNumber' | 'artistTitle' };

type SearchResultsListProps = {
  releases: SearchRelease[];
  selectedRelease: SearchRelease | null;
  coverImages: Record<number, string | null>;
  releaseContext: ReleaseContext | null;
  releaseContextStatus: string;
  releaseCatalogInfoStatus: string;
  includeDiscogsMarketStats: boolean;
  discogsMarketStats: MarketStats | null;
  discogsMarketStatsStatus: string;
  includeEbayAuctionValues: boolean;
  ebayListingStats: EbayStats | null;
  ebayListingStatus: string;
  onSelect: (release: SearchRelease) => void;
  onEditAndAdd: () => void;
  formatDiscogsText: (text: string) => string;
  formatPrice: (value: number | null | undefined, currency: string | null | undefined) => string;
};

export function SearchResultsList({
  releases, selectedRelease, coverImages, releaseContext, releaseContextStatus, releaseCatalogInfoStatus,
  includeDiscogsMarketStats, discogsMarketStats, discogsMarketStatsStatus, includeEbayAuctionValues,
  ebayListingStats, ebayListingStatus, onSelect, onEditAndAdd, formatDiscogsText, formatPrice,
}: SearchResultsListProps) {
  return <div className="results-list">
    {releases.map((release) => {
      const isSelected = selectedRelease?.id === release.id;
      const coverArt = release.coverImage || coverImages[release.id] || release.thumb;
      return <div key={release.id} role="button" tabIndex={0} className={`result-card ${isSelected ? 'selected' : ''}`} onClick={() => onSelect(release)} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(release); }
      }}>
        <div className="result-cover-column">
          {coverArt ? <img className="cover-thumbnail" src={coverArt} alt={`Cover art for ${release.title}`} /> : <div className="cover-placeholder" aria-label="No cover art available">No cover art</div>}
          {isSelected ? <button type="button" className="edit-add-button" onClick={(event) => { event.stopPropagation(); onEditAndAdd(); }}>Edit &amp; Add</button> : null}
        </div>
        <div className="result-content">
          <strong className="result-artist">{release.artist || 'Unknown artist'}</strong>
          <div className="result-title">{release.title || 'Untitled release'}</div>
          <div className="result-details">
            <div><strong>Release Year:</strong> {release.year ?? 'Unknown'}</div>
            <div><strong>{isSelected ? 'Release Label:' : 'Search-Result Label:'}</strong> {release.label ?? 'Unknown'}</div>
            <div><strong>Country:</strong> {release.country ?? 'Unknown'}</div>
            <div><strong>Catalog Number:</strong> {release.catalogNumber ?? 'Not listed'}</div>
            {release.barcode ? <div><strong>Barcode:</strong> {release.barcode}</div> : null}
            <div><strong>Format:</strong> {release.format || 'Unknown'}</div>
            {isSelected && releaseContext?.genre ? <div><strong>Genre:</strong> {releaseContext.genre}</div> : null}
            {isSelected && releaseContext?.style ? <div><strong>Style:</strong> {releaseContext.style}</div> : null}
          </div>
          {isSelected && <>
            {releaseCatalogInfoStatus ? <p className="hint">{releaseCatalogInfoStatus}</p> : null}
            {includeDiscogsMarketStats && <div className="price-suggestions" aria-live="polite"><strong>Discogs Market Statistics:</strong>{discogsMarketStatsStatus ? <div>{discogsMarketStatsStatus}</div> : null}{discogsMarketStats && (discogsMarketStats.low != null || discogsMarketStats.median != null || discogsMarketStats.high != null) ? <div><strong>Low / Median / High:</strong>{' '}{formatPrice(discogsMarketStats.low, discogsMarketStats.currency)} / {formatPrice(discogsMarketStats.median, discogsMarketStats.currency)} / {formatPrice(discogsMarketStats.high, discogsMarketStats.currency)}</div> : null}</div>}
            {includeEbayAuctionValues && <div className="price-suggestions" aria-live="polite"><strong>eBay Active Listings:</strong>{ebayListingStatus ? <div>{ebayListingStatus}</div> : null}{ebayListingStats?.sampledListingCount ? <div className={`ebay-listing-results ${ebayListingStats.searchMethod}`}><div><strong>Matching Listings:</strong> {ebayListingStats.listingCount}</div><div className={`ebay-search-method ${ebayListingStats.searchMethod}`}><strong>Search Used:</strong> {ebayListingStats.searchMethod === 'catalogNumber' ? 'Discogs catalog number' : 'artist and album title'}</div><div><strong>Priced Sample:</strong> {ebayListingStats.sampledListingCount} active listings</div><div><strong>Low / Average / High:</strong> {ebayListingStats.currency || '$'} {ebayListingStats.lowestPrice?.toFixed(2)} / {ebayListingStats.averagePrice?.toFixed(2)} / {ebayListingStats.highestPrice?.toFixed(2)}</div></div> : null}{ebayListingStats ? <div className="price-note">Current asking prices only; not eBay sold-price history.</div> : null}</div>}
            <div className="release-context-card" aria-live="polite">{releaseContextStatus ? <p>{releaseContextStatus}</p> : null}{releaseContext && releaseContext.descriptionSource !== 'artist' ? <div><strong>{releaseContext.descriptionSource === 'release' ? 'Release Notes' : releaseContext.descriptionSource === 'album' ? 'Album Notes' : 'Discogs Information'}</strong><p>{releaseContext.description ? formatDiscogsText(releaseContext.description) : 'Discogs does not provide release or album notes for this selection.'}</p></div> : null}</div>
          </>}
        </div>
      </div>;
    })}
  </div>;
}
