import type { FormEventHandler, RefObject } from 'react';
import type { DiscogsSearchController } from '../../controllers/useDiscogsSearchController';
import type { DiscogsMarketStats, DiscogsReleaseContext, EBayActiveListingStats } from '../../controllers/useCatalogDetailController';
import type { CdEntry, DiscogsResult } from '../../types';
import { formatDiscogsMarketPrice, formatDiscogsText } from '../../utils/catalog';
import { SearchResultsList } from './SearchResultsList';
import { SearchScanControls } from './SearchScanControls';
import { SelectedReleaseEditor } from './SelectedReleaseEditor';

type Details = { releaseContext: DiscogsReleaseContext | null; releaseContextStatus: string; catalogInfoStatus: string; includeMarketStats: boolean; marketStats: DiscogsMarketStats | null; marketStatsStatus: string; includeEbay: boolean; ebayStats: EBayActiveListingStats | null; ebayStatus: string };
type Voice = { listening: boolean; status: string; toggle: () => void };
type Scanner = { open: boolean; status: string; videoRef: RefObject<HTMLVideoElement>; openScanner: () => void; closeScanner: () => void };
type Editor = { panelRef: RefObject<HTMLElement>; title: string; artist: string; notes: string; mediaCondition: string; estimatedValue: string; status: string; saving: boolean; setTitle: (value: string) => void; setArtist: (value: string) => void; setNotes: (value: string) => void; setMediaCondition: (value: string) => void; setEstimatedValue: (value: string) => void; save: FormEventHandler; cancelCorrection: () => void };
type Actions = { search: () => void; clear: () => void; select: (release: DiscogsResult) => void; editAndAdd: () => void; setIncludeMarketStats: (value: boolean) => void; setIncludeEbay: (value: boolean) => void };
type Props = { controller: DiscogsSearchController; correction: CdEntry | null; workspaceRef: RefObject<HTMLDivElement>; details: Details; voice: Voice; scanner: Scanner; editor: Editor; mediaConditions: string[]; actions: Actions };

export function SearchPage({ controller: s, correction, workspaceRef, details, voice, scanner, editor, mediaConditions, actions }: Props) {
  const changeField = (field: 'artist' | 'albumTitle' | 'catalogNumber' | 'barcode', value: string) => {
    if (field === 'artist') s.setArtist(value);
    if (field === 'albumTitle') s.setAlbumTitle(value);
    if (field === 'catalogNumber') s.setCatalogNumber(value);
    if (field === 'barcode') s.setBarcode(value);
    s.setHasSearched(false); s.setCurrentPage(1);
  };
  return <>
    <h1>Search &amp; Scan</h1>
    <p>Look up a CD, scan its barcode, select the version you own, and add it to your catalog.</p>
    <div className="search-workspace" ref={workspaceRef}>
      <section className="card search-panel">
        <h2>{correction ? 'Correct Discogs match' : 'Add a CD'}</h2>
        {correction ? <p className="hint">Correcting <strong>{correction.artist} — {correction.title}</strong>. Your notes and condition are retained; valuation is refreshed or cleared.</p> : null}
        <SearchScanControls artist={s.artist} albumTitle={s.albumTitle} catalogNumber={s.catalogNumber} barcode={s.barcode} loading={s.loading} includeDiscogsMarketStats={details.includeMarketStats} includeEbayAuctionValues={details.includeEbay} voiceListening={voice.listening} voiceStatus={voice.status} scannerOpen={scanner.open} scannerStatus={scanner.status} scannerVideoRef={scanner.videoRef} onFieldChange={changeField} onSearch={actions.search} onClear={actions.clear} onIncludeDiscogsMarketStatsChange={actions.setIncludeMarketStats} onIncludeEbayAuctionValuesChange={actions.setIncludeEbay} onVoiceToggle={voice.toggle} onOpenScanner={scanner.openScanner} onCloseScanner={scanner.closeScanner} />
        <p className="hint">{s.summary}</p>
        {s.results.length ? <>
          <div className="search-criteria"><div><strong>Artist Name:</strong> {s.artist || 'Any artist'}</div><div><strong>Album Title:</strong> {s.albumTitle || 'Any album title'}</div></div>
          <div className="result-filter"><label>Country<select aria-label="Filter search results by country" value={s.countryFilter} disabled={s.availableCountries.length < 2} onChange={(event) => { s.setCountryFilter(event.target.value); s.setCurrentPage(1); }}><option value="">All countries</option>{s.availableCountries.map((country) => <option key={country} value={country}>{country}</option>)}</select></label></div>
          <SearchResultsList releases={s.visibleResults} selectedRelease={s.selectedRelease} coverImages={s.coverImages} releaseContext={details.releaseContext} releaseContextStatus={details.releaseContextStatus} releaseCatalogInfoStatus={details.catalogInfoStatus} includeDiscogsMarketStats={details.includeMarketStats} discogsMarketStats={details.marketStats} discogsMarketStatsStatus={details.marketStatsStatus} includeEbayAuctionValues={details.includeEbay} ebayListingStats={details.ebayStats} ebayListingStatus={details.ebayStatus} onSelect={(release) => actions.select(release as DiscogsResult)} onEditAndAdd={actions.editAndAdd} formatDiscogsText={formatDiscogsText} formatPrice={formatDiscogsMarketPrice} />
        </> : null}
        {s.totalPages > 1 ? <nav className="pagination" aria-label="Discogs search result pages"><button type="button" onClick={() => s.setCurrentPage((page) => page - 1)} disabled={s.currentPage === 1}>Previous</button><span>Page {s.currentPage} of {s.totalPages}</span><button type="button" onClick={() => s.setCurrentPage((page) => page + 1)} disabled={s.currentPage === s.totalPages}>Next</button></nav> : null}
      </section>
      <SelectedReleaseEditor panelRef={editor.panelRef} release={s.selectedRelease} context={details.releaseContext} title={editor.title} artist={editor.artist} notes={editor.notes} mediaCondition={editor.mediaCondition} estimatedValue={editor.estimatedValue} mediaConditions={mediaConditions} status={editor.status} correcting={Boolean(correction)} saving={editor.saving} onTitleChange={editor.setTitle} onArtistChange={editor.setArtist} onNotesChange={editor.setNotes} onMediaConditionChange={editor.setMediaCondition} onEstimatedValueChange={editor.setEstimatedValue} onSave={editor.save} onCancelCorrection={editor.cancelCorrection} />
    </div>
  </>;
}
