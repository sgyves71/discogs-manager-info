import type { FormEventHandler } from 'react';
import type { CatalogDetailController } from '../../controllers/useCatalogDetailController';
import type { CdEntry, DiscogsReleaseTrack, PersonalTrackMatch, SavedYouTubeTrackMatch, YouTubeVideoMatch } from '../../types';
import { formatDiscogsMarketDate, formatDiscogsMarketPrice, formatDiscogsText, formatMusicBrainzGenre, previewDiscogsText, trackKey } from '../../utils/catalog';
import { CatalogDetailsEditor } from './CatalogDetailsEditor';
import { EstimatedValueEditor } from './EstimatedValueEditor';
import { TracklistDialog } from './TracklistDialog';

type Actions = {
  close: () => void; searchEbay: (entry: CdEntry) => void; openMarketplace: (entry: CdEntry) => void;
  openRelease: (entry: CdEntry) => void; loadImages: () => void; openTracklist: () => void;
  beginDetailsEdit: () => void; beginValueEdit: () => void; correctMatch: (entry: CdEntry) => void;
  remove: (entry: CdEntry) => void; saveDetails: FormEventHandler; saveValue: () => void;
  expandSummary: (summary: string) => void; syncPersonalLocations: () => void;
  chooseYouTubeMatch: (track: DiscogsReleaseTrack, video: YouTubeVideoMatch) => void;
  playSavedMatch: (match: SavedYouTubeTrackMatch) => void; findPersonalCopy: (track: DiscogsReleaseTrack) => void;
  playPersonalCopy: (match: PersonalTrackMatch) => void; findYouTubeMatches: (track: DiscogsReleaseTrack) => void;
  searchYouTube: (track: DiscogsReleaseTrack) => void;
};

type Props = { entry: CdEntry; controller: CatalogDetailController; mediaConditions: string[]; saving: boolean; actions: Actions };

export function CatalogDetailDialog({ entry, controller: c, mediaConditions, saving, actions }: Props) {
  return <div className="collection-detail-overlay" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) actions.close();
    else if (event.target instanceof Element && !event.target.closest('.detail-action-menu')) c.setDetailActionMenuOpen(false);
  }}>
    <section className="collection-detail" role="dialog" aria-modal="true" aria-label={`Details for ${entry.artist} — ${entry.title}`}>
      <button type="button" className="dialog-close-button collection-detail-close" aria-label="Close catalog details" title="Close details" onClick={actions.close}>×</button>
      <div className="collection-detail-header">
        {c.detailCoverImage ? <img className="detail-cover" src={c.detailCoverImage} alt={`Cover art for ${entry.title}`} /> : <div className="detail-cover cover-placeholder">No cover art</div>}
        <div><h3>{entry.artist} — {entry.title}</h3><p>{entry.format || 'Format unknown'}{entry.year ? ` • ${entry.year}` : ''}</p>{entry.discogsUri ? <a href={`https://www.discogs.com${entry.discogsUri}`} target="_blank" rel="noreferrer">View on Discogs</a> : null}</div>
        <div className="collection-detail-controls"><div className="detail-action-menu">
          <button type="button" className="detail-action-menu-trigger" aria-label={`Actions for ${entry.artist} — ${entry.title}`} aria-expanded={c.detailActionMenuOpen} title="Catalog actions" onClick={() => c.setDetailActionMenuOpen((open) => !open)}>•••</button>
          {c.detailActionMenuOpen ? <div className="detail-action-menu-items">
            <button type="button" onClick={() => { c.setDetailActionMenuOpen(false); actions.searchEbay(entry); }}>Open eBay Listings</button>
            <button type="button" className="secondary-button" disabled={!entry.discogsId} onClick={() => { c.setDetailActionMenuOpen(false); actions.openMarketplace(entry); }}>Open Discogs Marketplace</button>
            <button type="button" className="secondary-button" disabled={!entry.discogsId && !entry.discogsUri} onClick={() => { c.setDetailActionMenuOpen(false); actions.openRelease(entry); }}>Open Discogs Release</button>
            <button type="button" className="secondary-button" disabled={!entry.discogsId} onClick={() => { c.setDetailActionMenuOpen(false); actions.loadImages(); }}>{c.showDetailImages ? 'Hide Release Images' : 'Show All Release Images'}</button>
            <button type="button" className="secondary-button" disabled={!entry.discogsId} onClick={() => { c.setDetailActionMenuOpen(false); actions.openTracklist(); }}>Show Tracklist</button>
            <button type="button" className="secondary-button" onClick={() => { c.setDetailActionMenuOpen(false); actions.beginDetailsEdit(); }}>Edit Catalog Details</button>
            <button type="button" className="secondary-button" onClick={() => { c.setDetailActionMenuOpen(false); actions.beginValueEdit(); }}>Update Estimated Value</button>
            <button type="button" className="secondary-button" onClick={() => { c.setDetailActionMenuOpen(false); actions.correctMatch(entry); }}>Correct Discogs Match</button>
            <button type="button" className="danger-button" onClick={() => { c.setDetailActionMenuOpen(false); actions.remove(entry); }}>Remove Entry</button>
          </div> : null}
        </div></div>
      </div>
      {c.detailStatus ? <p className="hint">{c.detailStatus}</p> : null}
      <div className="detail-grid"><div><strong>Label:</strong> {entry.label || 'Not listed'}</div><div><strong>Country:</strong> {entry.country || 'Not listed'}</div><div><strong>Catalog Number:</strong> {entry.catalogNumber || 'Not listed'}</div>{entry.barcode ? <div><strong>Barcode:</strong> {entry.barcode}</div> : null}{entry.genre ? <div><strong>Genre:</strong> {entry.genre}</div> : null}{entry.style ? <div><strong>Style:</strong> {entry.style}</div> : null}<div><strong>Media Condition:</strong> {entry.mediaCondition || 'Not specified'}</div><div><strong>Estimated Value:</strong> {entry.estimatedValue != null ? `$${entry.estimatedValue.toFixed(2)}` : 'Not set'}{entry.estimatedValueReviewedAt ? ' (Manually Reviewed)' : ''}</div></div>
      <div className="detail-section discogs-market-stats"><strong>Discogs Market Statistics</strong>{entry.discogsMarketStatsCheckedAt ? <><div className="detail-grid"><div><strong>Last Sold:</strong> {formatDiscogsMarketDate(entry.discogsLastSoldAt)}</div><div><strong>Low:</strong> {formatDiscogsMarketPrice(entry.discogsMarketLow, entry.discogsMarketCurrency)}</div><div><strong>Median:</strong> {formatDiscogsMarketPrice(entry.discogsMarketMedian, entry.discogsMarketCurrency)}</div><div><strong>High:</strong> {formatDiscogsMarketPrice(entry.discogsMarketHigh, entry.discogsMarketCurrency)}</div></div><p className="hint">Last checked: {formatDiscogsMarketDate(entry.discogsMarketStatsCheckedAt)}</p></> : <p className="hint">No recent sale detail found.</p>}</div>
      {c.editingCatalogDetails && c.catalogDetailsForm ? <CatalogDetailsEditor value={c.catalogDetailsForm} mediaConditions={mediaConditions} status={c.catalogDetailsStatus} saving={saving} onChange={c.setCatalogDetailsForm} onSave={actions.saveDetails} onCancel={() => { c.setEditingCatalogDetails(false); c.setCatalogDetailsForm(null); c.setCatalogDetailsStatus(''); }} /> : null}
      {c.editingEstimatedValue ? <EstimatedValueEditor value={c.estimatedValueInput} status={c.estimatedValueStatus} saving={saving} onChange={c.setEstimatedValueInput} onSave={actions.saveValue} onCancel={() => { c.setEditingEstimatedValue(false); c.setEstimatedValueStatus(''); }} /> : null}
      {entry.notes ? <div className="detail-section"><strong>Your Notes</strong><p>{entry.notes}</p></div> : null}
      {c.detailMusicBrainzContext?.artist ? <div className="detail-section"><strong>Artist Details <span className="hint">- MusicBrainz</span></strong><p>{[c.detailMusicBrainzContext.artist.type,c.detailMusicBrainzContext.artist.country,c.detailMusicBrainzContext.artist.beginDate ? `Formed ${c.detailMusicBrainzContext.artist.beginDate}` : null,c.detailMusicBrainzContext.artist.ended && c.detailMusicBrainzContext.artist.endDate ? `Ended ${c.detailMusicBrainzContext.artist.endDate}` : null,c.detailMusicBrainzContext.artist.disambiguation].filter(Boolean).join(' - ')}</p>{c.detailMusicBrainzContext.artist.genres.length ? <p><strong>Genres:</strong> {c.detailMusicBrainzContext.artist.genres.map(formatMusicBrainzGenre).join(', ')}</p> : null}</div> : null}
      {c.detailMusicBrainzContext?.artist?.annotation ? <Summary title="Artist Summary" source="MusicBrainz" text={c.detailMusicBrainzContext.artist.annotation} onExpand={actions.expandSummary} /> : c.detailContext?.artistProfile && c.detailContext.descriptionSource !== 'artist' ? <Summary title="Artist Summary" source="Discogs" text={c.detailContext.artistProfile} onExpand={actions.expandSummary} /> : null}
      {c.detailMusicBrainzContext?.releaseGroup?.annotation ? <div className="detail-section"><strong>Album Notes <span className="hint">- MusicBrainz</span></strong><p>{formatDiscogsText(c.detailMusicBrainzContext.releaseGroup.annotation)}</p>{c.detailMusicBrainzContext.releaseGroup.genres.length ? <p><strong>Genres:</strong> {c.detailMusicBrainzContext.releaseGroup.genres.map(formatMusicBrainzGenre).join(', ')}</p> : null}</div> : c.detailContext && !(c.detailContext.descriptionSource === 'artist' && c.detailMusicBrainzContext?.artist?.annotation) ? <ContextNotes controller={c} onExpand={actions.expandSummary} /> : null}
      {c.detailEbayStats?.sampledListingCount ? <div className={`detail-section ebay-listing-results ${c.detailEbayStats.searchMethod}`}><strong>eBay active listings</strong><p>{c.detailEbayStats.listingCount} listings found • {c.detailEbayStats.searchMethod === 'catalogNumber' ? 'catalog number match' : 'artist/title CD search'} • Low / average / high: {c.detailEbayStats.currency || '$'} {c.detailEbayStats.lowestPrice?.toFixed(2)} / {c.detailEbayStats.averagePrice?.toFixed(2)} / {c.detailEbayStats.highestPrice?.toFixed(2)}</p></div> : null}
      {c.showDetailImages ? <div className="detail-section release-image-gallery"><strong>Release Images</strong>{c.detailImagesStatus ? <p>{c.detailImagesStatus}</p> : null}{c.detailImages.length ? <div className="release-image-grid">{c.detailImages.map((image,index) => <a key={image.url} href={image.url} target="_blank" rel="noreferrer" title="Open full-size image"><img src={image.thumbnailUrl} alt={`${entry.title} image ${index + 1}`} /></a>)}</div> : null}</div> : null}
      {c.showTracklist ? <TracklistDialog artist={entry.artist} albumTitle={entry.title} tracks={c.detailTracks} trackStatus={c.detailTracksStatus} personalMusicStatus={c.personalMusicStatus} youTubeStatus={c.youTubeStatus} personalLocationSyncing={c.personalLocationSyncing} youTubeCandidates={c.youTubeCandidates} youTubePlayer={c.youTubePlayer} savedYouTubeMatches={c.savedYouTubeMatches} personalTrackMatches={c.personalTrackMatches} trackKey={trackKey} onClose={() => c.setShowTracklist(false)} onSyncPersonalLocations={actions.syncPersonalLocations} onChooseYouTubeMatch={actions.chooseYouTubeMatch} onCancelYouTubeCandidates={() => c.setYouTubeCandidates(null)} onCloseYouTubePlayer={() => c.setYouTubePlayer(null)} onPlaySavedMatch={actions.playSavedMatch} onFindPersonalCopy={actions.findPersonalCopy} onPlayPersonalCopy={actions.playPersonalCopy} onFindYouTubeMatches={actions.findYouTubeMatches} onSearchYouTube={actions.searchYouTube} /> : null}
    </section>
  </div>;
}

function Summary({ title, source, text, onExpand }: { title: string; source: string; text: string; onExpand: (value: string) => void }) { const formatted = formatDiscogsText(text); return <div className="detail-section"><strong>{title} <span className="hint">- {source}</span></strong><p className="artist-summary-preview"><span className="artist-summary-desktop">{formatted}</span><span className="artist-summary-mobile">{previewDiscogsText(formatted)}</span></p><button type="button" className="artist-summary-show-all" onClick={() => onExpand(formatted)}>Show All</button></div>; }
function ContextNotes({ controller: c, onExpand }: { controller: CatalogDetailController; onExpand: (value: string) => void }) {
  const context = c.detailContext!;
  const title = context.descriptionSource === 'release' ? 'Release Notes' : context.descriptionSource === 'album' ? 'Album Notes' : 'Artist Summary';
  const formatted = context.description ? formatDiscogsText(context.description) : '';
  const isArtistSummary = context.descriptionSource === 'artist';
  return <div className="detail-section">
    <strong>{title} <span className="hint">- Discogs</span></strong>
    <p className={isArtistSummary ? 'artist-summary-preview' : undefined}>
      {formatted ? isArtistSummary ? <><span className="artist-summary-desktop">{formatted}</span><span className="artist-summary-mobile">{previewDiscogsText(formatted)}</span></> : formatted : 'No additional Discogs notes are available.'}
    </p>
    {isArtistSummary && formatted ? <button type="button" className="artist-summary-show-all" onClick={() => onExpand(formatted)}>Show All</button> : null}
  </div>;
}
