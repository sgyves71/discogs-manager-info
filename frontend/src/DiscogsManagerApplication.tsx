import { useRef, useState } from 'react';
import { ArtistSummaryDialog } from './components/catalog/ArtistSummaryDialog';
import { CatalogDetailDialog } from './components/catalog/CatalogDetailDialog';
import { CatalogPage } from './components/catalog/CatalogPage';
import { CatalogStatisticsPage } from './components/catalog/CatalogStatisticsPage';
import { PersonalAlbumMappingDialog } from './components/catalog/PersonalAlbumMappingDialog';
import { PersonalMatchNotFoundDialog } from './components/catalog/PersonalMatchNotFoundDialog';
import { MusicLibraryPage } from './components/library/MusicLibraryPage';
import { SearchPage } from './components/search/SearchPage';
import { LocalAudioPlayer } from './components/shared/LocalAudioPlayer';
import { ModalDialog } from './components/shared/ModalDialog';
import { useCatalogController } from './controllers/useCatalogController';
import { useMusicLibraryController } from './controllers/useMusicLibraryController';
import { useDiscogsSearchController } from './controllers/useDiscogsSearchController';
import { useCatalogDetailController } from './controllers/useCatalogDetailController';
import { useCatalogNumberVoice } from './controllers/useCatalogNumberVoice';
import { useBarcodeScanner } from './controllers/useBarcodeScanner';
import { usePlaybackController } from './controllers/usePlaybackController';
import { useCatalogEditorController } from './controllers/useCatalogEditorController';
import { useCatalogContextController } from './controllers/useCatalogContextController';
import { MEDIA_CONDITIONS, formatDiscogsMarketPrice } from './utils/catalog';
import type { DiscogsResult } from './types';

export function DiscogsManagerApplication() {
  const [activePage, setActivePage] = useState<'search' | 'catalog' | 'library' | 'statistics'>('search');
  const catalog = useCatalogController(activePage);
  const {
    items, setItems, search: collectionSearch, setSearch: setCollectionSearch,
    style: collectionStyle, setStyle: setCollectionStyle, styleOptions: collectionStyleOptions,
    sort: collectionSort, setSort: setCollectionSort, setPage: setCollectionPage,
    total: collectionTotal, setTotal: setCollectionTotal, loading: collectionLoading,
    status: collectionStatus, setStatus: setCollectionStatus,
    statistics: catalogStatistics, statisticsStatus: catalogStatisticsStatus,
    loadInFlightRef: collectionLoadInFlightRef, hasMoreItems: hasMoreCollectionItems,
  } = catalog;
  const search = useDiscogsSearchController();
  const {
    setCatalogNumber: setSearchCatalogNumber, setBarcode: setSearchBarcode,
    setHasSearched, setCurrentPage, status,
    catalogInfoStatus: releaseCatalogInfoStatus,
    searchDiscogs, clear: clearSearchState, selectRelease,
  } = search;
  const { status: catalogVoiceStatus, listening: catalogVoiceListening, start: startCatalogNumberVoiceEntry, stop: stopCatalogNumberVoiceEntry } = useCatalogNumberVoice(activePage === 'search', (value) => {
    setSearchCatalogNumber(value); setHasSearched(false); setCurrentPage(1);
  });
  const { open: scannerOpen, setOpen: setScannerOpen, status: scannerStatus, setStatus: setScannerStatus, videoRef: scannerVideoRef } = useBarcodeScanner((barcode) => {
    setSearchBarcode(barcode); setHasSearched(false); setCurrentPage(1); void searchDiscogs(barcode);
  });
  const detail = useCatalogDetailController();
  const { viewedEntry,setViewedEntry,setYouTubePlayer,setPersonalMusicStatus,localAudioPlayer,setLocalAudioPlayer,albumPlaybackNotFound,setAlbumPlaybackNotFound,personalArtistFolders,personalBrowsableAlbumFolders,showPersonalFolderMapping,setShowPersonalFolderMapping,selectedPersonalArtistFolderPath,selectedPersonalAlbumFolderPath,personalAlbumValidation,personalTrackNotFoundPrompt,setPersonalTrackNotFoundPrompt,personalAlbumMappingStatus } = detail;
  const libraryController = useMusicLibraryController(activePage);
  const {
    library: musicLibrary, libraryPath: musicLibraryPath,
    setLibraryPath: setMusicLibraryPath, libraryStatus: musicLibraryStatus,
    savingLibrary: savingMusicLibrary,
    marketStatsBackfill, marketStatsBackfillStatus, discogsCollectionSync,
    discogsCollectionSyncStatus,
    saveLibrary: saveMusicLibrary, scanLibrary: scanMusicLibrary,
    startMarketStatsBackfill, startDiscogsCollectionSync,
  } = libraryController;
  const playback = usePlaybackController(detail, { setItems, setCollectionStatus });
  const { loadDetailImages, openDiscogsRelease, openDiscogsMarketplace, openTracklist, openTrackOnYouTube, findYouTubeMatches, chooseYouTubeMatch, findPersonalCopy, playLocalCopy, playAlbum, playNextLocalCopy, playPreviousLocalCopy, syncPersonalTrackLocations, savePersonalAlbumFolder, beginManualPersonalAlbumMatch, browsePersonalAlbumFolders, validatePersonalAlbumFolder } = playback;
  const editor = useCatalogEditorController({ catalog, detail, search, setActivePage });
  const { title,setTitle,artist,setArtist,notes,setNotes,mediaCondition,setMediaCondition,estimatedValueOverride,setEstimatedValueOverride,setHasEstimatedValueOverride,entryBeingCorrected,catalogSaveAction,catalogSaveError,setCatalogSaveError,handleSave,beginMatchCorrection,cancelMatchCorrection,openEbaySearch,removeCatalogEntry,beginEstimatedValueEdit,saveEstimatedValue,beginCatalogDetailsEdit,saveCatalogDetails } = editor;
  const context = useCatalogContextController(search, detail);
  const { ebayListingStats,setEbayListingStats,ebayListingStatus,setEbayListingStatus,includeEbayAuctionValues,setIncludeEbayAuctionValues,discogsSearchMarketStats,discogsSearchMarketStatsStatus,includeDiscogsMarketStats,setIncludeDiscogsMarketStats,releaseContext,setReleaseContext,releaseContextStatus,setReleaseContextStatus } = context;
  const [expandedArtistSummary, setExpandedArtistSummary] = useState<string | null>(null);
  const addCardRef = useRef<HTMLDivElement>(null);
  const selectedReleasePanelRef = useRef<HTMLElement>(null);

  function openSelectedReleaseEditor() {
    selectedReleasePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const handleSearch = searchDiscogs;

  function clearSearch() {
    stopCatalogNumberVoiceEntry();
    clearSearchState();
    setReleaseContext(null);
    setReleaseContextStatus('');
    setEbayListingStats(null);
    setEbayListingStatus('');
  }

  async function selectSearchResult(release: DiscogsResult) {
    setExpandedArtistSummary(null);
    await selectRelease(release);
  }

  const uiLockMessage = catalogSaveAction;
  const uiLockDetail = catalogSaveAction
    ? 'Please wait while the update completes.'
    : '';

  return (
    <div className={`app-layout${localAudioPlayer ? ' has-local-audio-player' : ''}`} aria-busy={Boolean(uiLockMessage)} onKeyDownCapture={(event) => {
      if (uiLockMessage) { event.preventDefault(); event.stopPropagation(); }
    }}>
      {uiLockMessage ? <div className="catalog-save-overlay" role="status" aria-live="assertive"><div><strong>{uiLockMessage}</strong><span>{uiLockDetail}</span></div></div> : null}
      <aside className="app-nav" aria-label="Application navigation">
        <div className="app-brand">Discogs Manager</div>
        <button type="button" className={activePage === 'search' ? 'active' : ''} onClick={() => setActivePage('search')}>Search &amp; Scan</button>
        <button type="button" className={activePage === 'catalog' ? 'active' : ''} onClick={() => setActivePage('catalog')}>Catalog</button>
        <button type="button" className={activePage === 'statistics' ? 'active' : ''} onClick={() => setActivePage('statistics')}>Catalog Statistics</button>
        <button type="button" className={activePage === 'library' ? 'active' : ''} onClick={() => setActivePage('library')}>Music Library</button>
      </aside>
      <main className={`app-shell${activePage === 'catalog' ? ' catalog-shell' : ''}`}>
      {activePage === 'statistics' && <CatalogStatisticsPage
        statistics={catalogStatistics}
        status={catalogStatisticsStatus}
        formatPrice={formatDiscogsMarketPrice}
        onSelectStyle={(style) => {
          collectionLoadInFlightRef.current = false;
          setCollectionStyle(style);
          setCollectionPage(1);
          setItems([]);
          setCollectionTotal(0);
          setActivePage('catalog');
        }}
      />}
      {activePage === 'library' && <MusicLibraryPage
        library={musicLibrary}
        libraryPath={musicLibraryPath}
        libraryStatus={musicLibraryStatus}
        savingLibrary={savingMusicLibrary}
        marketStatsBackfill={marketStatsBackfill}
        marketStatsBackfillStatus={marketStatsBackfillStatus}
        discogsCollectionSync={discogsCollectionSync}
        discogsCollectionSyncStatus={discogsCollectionSyncStatus}
        onLibraryPathChange={setMusicLibraryPath}
        onSaveLibrary={() => void saveMusicLibrary()}
        onScanLibrary={() => void scanMusicLibrary()}
        onUpdateValuations={() => void startMarketStatsBackfill()}
        onSyncDiscogsCollection={() => void startDiscogsCollectionSync()}
      />}
      {activePage === 'search' ? <SearchPage
        controller={search}
        correction={entryBeingCorrected}
        workspaceRef={addCardRef}
        details={{
          releaseContext, releaseContextStatus, catalogInfoStatus: releaseCatalogInfoStatus,
          includeMarketStats: includeDiscogsMarketStats, marketStats: discogsSearchMarketStats,
          marketStatsStatus: discogsSearchMarketStatsStatus, includeEbay: includeEbayAuctionValues,
          ebayStats: ebayListingStats, ebayStatus: ebayListingStatus,
        }}
        voice={{
          listening: catalogVoiceListening, status: catalogVoiceStatus,
          toggle: catalogVoiceListening ? stopCatalogNumberVoiceEntry : startCatalogNumberVoiceEntry,
        }}
        scanner={{
          open: scannerOpen, status: scannerStatus, videoRef: scannerVideoRef,
          openScanner: () => { setScannerStatus('Opening camera...'); setScannerOpen(true); },
          closeScanner: () => setScannerOpen(false),
        }}
        editor={{
          panelRef: selectedReleasePanelRef, title, artist, notes, mediaCondition,
          estimatedValue: estimatedValueOverride, status, saving: Boolean(catalogSaveAction),
          setTitle, setArtist, setNotes, setMediaCondition,
          setEstimatedValue: (value) => { setEstimatedValueOverride(value); setHasEstimatedValueOverride(true); },
          save: handleSave, cancelCorrection: cancelMatchCorrection,
        }}
        mediaConditions={MEDIA_CONDITIONS}
        actions={{
          search: () => void handleSearch(), clear: clearSearch,
          select: (release) => void selectSearchResult(release), editAndAdd: openSelectedReleaseEditor,
          setIncludeMarketStats: setIncludeDiscogsMarketStats,
          setIncludeEbay: setIncludeEbayAuctionValues,
        }}
      /> : null}

      {activePage === 'catalog' && (
        <>
      <CatalogPage
        items={items}
        search={collectionSearch}
        style={collectionStyle}
        styleOptions={collectionStyleOptions}
        total={collectionTotal}
        isLoading={collectionLoading}
        hasMoreItems={hasMoreCollectionItems}
        status={collectionStatus}
        sort={collectionSort}
        hasOpenDetail={Boolean(viewedEntry)}
        showPlaybackLinkStatus={Boolean(
          libraryController.library?.lastScannedAt
          && libraryController.library.scan.status !== 'scanning'
          && libraryController.library.catalogLocationScan.status !== 'scanning',
        )}
        onSearchChange={(value) => { collectionLoadInFlightRef.current = false; setCollectionSearch(value); setCollectionPage(1); setItems([]); setCollectionTotal(0); }}
        onStyleChange={(value) => { collectionLoadInFlightRef.current = false; setCollectionStyle(value); setCollectionPage(1); setItems([]); setCollectionTotal(0); }}
        onSortChange={(value) => { collectionLoadInFlightRef.current = false; setCollectionSort(value); setCollectionPage(1); setItems([]); setCollectionTotal(0); }}
        onOpenDetail={setViewedEntry}
        onChangeAssociation={beginMatchCorrection}
        onSearchEbay={(item) => { void openEbaySearch(item); }}
        onRemove={(item) => { void removeCatalogEntry(item); }}
        onLoadMore={() => {
          if (!collectionLoading && hasMoreCollectionItems && !collectionLoadInFlightRef.current) {
            collectionLoadInFlightRef.current = true;
            setCollectionPage((current) => current + 1);
          }
        }}
      >
        {viewedEntry ? <CatalogDetailDialog
          entry={viewedEntry}
          controller={detail}
          mediaConditions={MEDIA_CONDITIONS}
          saving={Boolean(catalogSaveAction)}
          actions={{
            close: () => setViewedEntry(null),
            searchEbay: (entry) => void openEbaySearch(entry),
            openMarketplace: openDiscogsMarketplace,
            openRelease: openDiscogsRelease,
            loadImages: () => void loadDetailImages(),
            openTracklist: () => void openTracklist(),
            playAlbum: () => void playAlbum(),
            beginDetailsEdit: beginCatalogDetailsEdit,
            beginValueEdit: beginEstimatedValueEdit,
            correctMatch: beginMatchCorrection,
            remove: (entry) => void removeCatalogEntry(entry),
            saveDetails: saveCatalogDetails,
            saveValue: () => void saveEstimatedValue(),
            expandSummary: setExpandedArtistSummary,
            syncPersonalLocations: () => void syncPersonalTrackLocations(),
            chooseYouTubeMatch: (track, video) => void chooseYouTubeMatch(track, video),
            playSavedMatch: (match) => { setLocalAudioPlayer(null); setYouTubePlayer({ videoId: match.videoId, title: match.videoTitle, watchUrl: match.videoUrl }); },
            findPersonalCopy: (track) => void findPersonalCopy(track),
            playPersonalCopy: playLocalCopy,
            findYouTubeMatches: (track) => void findYouTubeMatches(track),
            searchYouTube: openTrackOnYouTube,
          }}
        /> : null}
      </CatalogPage>
      {expandedArtistSummary ? <ArtistSummaryDialog summary={expandedArtistSummary} onClose={() => setExpandedArtistSummary(null)} /> : null}
      {personalTrackNotFoundPrompt ? <PersonalMatchNotFoundDialog title={personalTrackNotFoundPrompt.title} onManualMatch={beginManualPersonalAlbumMatch} onClose={() => setPersonalTrackNotFoundPrompt(null)} /> : null}
      {showPersonalFolderMapping ? <PersonalAlbumMappingDialog
        validation={personalAlbumValidation}
        artistFolders={personalArtistFolders}
        albumFolders={personalBrowsableAlbumFolders}
        artistPath={selectedPersonalArtistFolderPath}
        albumPath={selectedPersonalAlbumFolderPath}
        status={personalAlbumMappingStatus}
        onArtistChange={(path) => void browsePersonalAlbumFolders(path)}
        onAlbumChange={(path) => void validatePersonalAlbumFolder(path)}
        onSave={() => void savePersonalAlbumFolder(selectedPersonalAlbumFolderPath)}
        onClose={() => setShowPersonalFolderMapping(false)}
      /> : null}
        </>
      )}
      {catalogSaveError ? <ModalDialog label="Catalog save error" className="artist-summary-dialog catalog-save-error-dialog" onClose={() => setCatalogSaveError(null)}><div className="artist-summary-dialog-header"><h2>Cannot Save Catalog Entry</h2></div><p>{catalogSaveError}</p><div className="form-actions"><button type="button" autoFocus onClick={() => setCatalogSaveError(null)}>OK</button></div></ModalDialog> : null}
      {albumPlaybackNotFound ? <ModalDialog label="Album not found in playback collection" onClose={() => setAlbumPlaybackNotFound(false)}><div className="artist-summary-dialog-header"><h2>Album Not Found</h2></div><p>Album not found in playback collection.</p><div className="form-actions"><button type="button" autoFocus onClick={() => setAlbumPlaybackNotFound(false)}>OK</button></div></ModalDialog> : null}
      </main>
      {localAudioPlayer ? <LocalAudioPlayer {...localAudioPlayer} onEnded={() => void playNextLocalCopy()} onPrevious={() => void playPreviousLocalCopy()} onNext={() => void playNextLocalCopy()} onClose={() => setLocalAudioPlayer(null)} onError={setPersonalMusicStatus} /> : null}
    </div>
  );
}

