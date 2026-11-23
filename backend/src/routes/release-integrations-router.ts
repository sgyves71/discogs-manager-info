import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { getDiscogsPriceSuggestions, getDiscogsReleaseCatalogInfo, getDiscogsReleaseContext, getDiscogsReleaseImages, getDiscogsReleaseTracklist, searchDiscogsReleases } from '../discogs.js';
import { getMusicBrainzCatalogContext, searchMusicBrainz } from '../musicbrainz.js';
import { getEbayActiveListingStats, getEbaySoldListingStats } from '../ebay.js';
import { findYouTubeMatches } from '../youtube.js';
import type { CatalogEnrichmentService } from '../services/catalog-enrichment-service.js';
import type { DiscogsCoverLookupService } from '../services/discogs-cover-lookup-service.js';
import { fetchDiscogsMarketStats } from '../discogs-market-stats.js';
import { getStageDiscogsCatalogInfo, getStageDiscogsContext, getStageDiscogsCover, getStageDiscogsImages, getStageDiscogsTracklist, searchStageDiscogsReleases } from '../stage-discogs-fixture.js';
import { getStageMusicBrainzCatalogContext, searchStageMusicBrainz } from '../stage-musicbrainz-fixture.js';

export function createReleaseIntegrationsRouter({
  prisma, catalogEnrichment, discogsCoverLookup, isStageEnvironment, discogsToken,
  ebayClientId, ebayClientSecret, ebayMarketplaceId, youtubeApiKey,
}: {
  prisma: PrismaClient;
  catalogEnrichment: CatalogEnrichmentService;
  discogsCoverLookup: DiscogsCoverLookupService;
  isStageEnvironment: boolean;
  discogsToken?: string;
  ebayClientId?: string;
  ebayClientSecret?: string;
  ebayMarketplaceId: string;
  youtubeApiKey?: string;
}) {
  const router = Router();

  router.get('/api/discogs/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    const artist = String(req.query.artist || '').trim();
    const releaseTitle = String(req.query.title || '').trim();
    const catalogNumber = String(req.query.catno || '').trim();
    const barcode = String(req.query.barcode || '').trim();

    if (!query && !artist && !releaseTitle && !catalogNumber && !barcode) {
      res.json([]);
      return;
    }

    if (isStageEnvironment) {
      res.json(searchStageDiscogsReleases({ query, artist, title: releaseTitle, catalogNumber, barcode }));
      return;
    }

    if (!discogsToken) {
      const fallbackResults = [
        {
          id: 1001,
          title: `${releaseTitle || query || 'Demo release'} (demo release)`,
          artist: artist || 'Demo Artist',
          year: 1999,
          country: 'US',
          label: 'Demo Label',
          format: 'CD, Album',
          uri: '/release/1001',
          thumb: null,
          coverImage: null,
          catalogNumber: null,
          barcode: null,
          lowestPrice: 19.99,
        },
        {
          id: 1002,
          title: `${releaseTitle || query || 'Demo release'} (alternate mix)`,
          artist: artist || 'Demo Artist',
          year: 2003,
          country: 'UK',
          label: 'Demo Label',
          format: 'CD, Album',
          uri: '/release/1002',
          thumb: null,
          coverImage: null,
          catalogNumber: null,
          barcode: null,
          lowestPrice: 24.5,
        },
      ].map((result) => ({
        ...result,
        title: result.title.replace(/\s+\(demo release\)|\s+\(alternate mix\)/, ''),
      }));

      res.json(fallbackResults);
      return;
    }

    try {
      const normalized = await searchDiscogsReleases(
        query,
        discogsToken,
        undefined,
        artist,
        releaseTitle,
        catalogNumber,
        barcode,
      );
      res.json(normalized);
    } catch (error) {
      console.error(error);
      res.status(502).json({ error: 'Unable to search Discogs right now.' });
    }
  });

  router.get('/api/musicbrainz/search', async (req, res) => {
    const artist = String(req.query.artist || '').trim();
    const album = String(req.query.album || '').trim();

    if (!artist && !album) {
      res.status(400).json({ error: 'Provide an artist or album title.' });
      return;
    }

    if (isStageEnvironment) {
      res.json(searchStageMusicBrainz({ artist, album }));
      return;
    }

    try {
      res.json(await searchMusicBrainz({ artist, album }));
    } catch (error) {
      console.error('MusicBrainz search failed:', error);
      res.status(502).json({ error: 'Unable to search MusicBrainz right now.' });
    }
  });

  router.get('/api/musicbrainz/context', async (req, res) => {
    const artist = String(req.query.artist || '').trim();
    const album = String(req.query.album || '').trim();
    if (!artist && !album) {
      res.status(400).json({ error: 'Provide an artist or album title.' });
      return;
    }

    if (isStageEnvironment) {
      res.json(getStageMusicBrainzCatalogContext({ artist, album }));
      return;
    }

    try {
      res.json(await getMusicBrainzCatalogContext({ artist, album }));
    } catch (error) {
      console.error('MusicBrainz context lookup failed:', error);
      res.status(502).json({ error: 'Unable to load MusicBrainz details right now.' });
    }
  });

  router.get('/api/discogs/releases/:id/cover', async (req, res) => {
    const releaseId = Number(req.params.id);
    if (!Number.isInteger(releaseId) || releaseId <= 0) {
      res.status(400).json({ error: 'A valid Discogs release ID is required.' });
      return;
    }

    if (isStageEnvironment) {
      res.json({ coverImage: getStageDiscogsCover(releaseId) });
      return;
    }

    if (!discogsToken) {
      res.json({ coverImage: null });
      return;
    }

    try {
      res.json({ coverImage: await discogsCoverLookup.getCover(releaseId) });
    } catch (error) {
      console.error('Discogs cover lookup failed:', error);
      res.status(502).json({ error: 'Unable to load cover art right now.' });
    }
  });

  router.get('/api/discogs/releases/:id/images', async (req, res) => {
    const releaseId = Number(req.params.id);
    if (!Number.isInteger(releaseId) || releaseId <= 0) {
      res.status(400).json({ error: 'A valid Discogs release ID is required.' });
      return;
    }
    if (isStageEnvironment) {
      const images = getStageDiscogsImages(releaseId);
      if (!images) {
        res.status(404).json({ error: 'Stage Discogs release not found.' });
        return;
      }
      res.json({ images });
      return;
    }
    if (!discogsToken) {
      res.status(503).json({ error: 'Discogs authentication is not configured.' });
      return;
    }
    try {
      res.json({ images: await getDiscogsReleaseImages(releaseId, discogsToken) });
    } catch (error) {
      console.error('Discogs image gallery lookup failed:', error);
      res.status(502).json({ error: 'Unable to load release images right now.' });
    }
  });

  router.get('/api/discogs/releases/:id/tracklist', async (req, res) => {
    const releaseId = Number(req.params.id);
    if (!Number.isInteger(releaseId) || releaseId <= 0) {
      res.status(400).json({ error: 'A valid Discogs release ID is required.' });
      return;
    }
    if (isStageEnvironment) {
      const tracks = getStageDiscogsTracklist(releaseId);
      if (!tracks) {
        res.status(404).json({ error: 'Stage Discogs release not found.' });
        return;
      }
      res.json({ tracks });
      return;
    }
    if (!discogsToken) {
      res.status(503).json({ error: 'Discogs authentication is not configured.' });
      return;
    }
    try {
      res.json({ tracks: await getDiscogsReleaseTracklist(releaseId, discogsToken) });
    } catch (error) {
      console.error('Discogs tracklist lookup failed:', error);
      res.status(502).json({ error: 'Unable to load the tracklist right now.' });
    }
  });

  router.get('/api/discogs/releases/:id/price-suggestions', async (req, res) => {
    const releaseId = Number(req.params.id);
    if (!Number.isInteger(releaseId) || releaseId <= 0) {
      res.status(400).json({ error: 'A valid Discogs release ID is required.' });
      return;
    }

    if (!discogsToken) {
      res.status(503).json({ error: 'Discogs authentication is not configured.' });
      return;
    }

    try {
      res.json({ suggestions: await getDiscogsPriceSuggestions(releaseId, discogsToken) });
    } catch (error) {
      console.error('Discogs price-suggestion lookup failed:', error);
      res.status(502).json({ error: 'Discogs could not provide price suggestions. Complete Discogs Seller Settings if this continues.' });
    }
  });

  router.get('/api/discogs/releases/:id/catalog-info', async (req, res) => {
    const releaseId = Number(req.params.id);
    if (!Number.isInteger(releaseId) || releaseId <= 0) {
      res.status(400).json({ error: 'A valid Discogs release ID is required.' });
      return;
    }
    if (isStageEnvironment) {
      const info = getStageDiscogsCatalogInfo(releaseId);
      if (!info) {
        res.status(404).json({ error: 'Stage Discogs release not found.' });
        return;
      }
      res.json(info);
      return;
    }
    if (!discogsToken) {
      res.status(503).json({ error: 'Discogs authentication is not configured.' });
      return;
    }
    try {
      res.json(await getDiscogsReleaseCatalogInfo(releaseId, discogsToken));
    } catch (error) {
      console.error('Discogs release-label lookup failed:', error);
      res.status(502).json({ error: 'Discogs could not provide release label information right now.' });
    }
  });

  router.get('/api/discogs/releases/:id/market-stats', async (req, res) => {
    const releaseId = Number(req.params.id);
    if (!Number.isInteger(releaseId) || releaseId <= 0) {
      res.status(400).json({ error: 'A valid Discogs release ID is required.' });
      return;
    }
    if (isStageEnvironment) {
      res.json({ lastSoldAt: null, low: null, median: null, high: null, currency: null });
      return;
    }
    try {
      const stats = await fetchDiscogsMarketStats(releaseId);
      res.json({ ...stats, lastSoldAt: stats.lastSoldAt?.toISOString() ?? null });
    } catch (error) {
      console.error('Discogs market-statistics lookup failed:', error);
      res.status(502).json({ error: 'Discogs could not provide market statistics right now.' });
    }
  });

  router.get('/api/discogs/releases/:id/context', async (req, res) => {
    const releaseId = Number(req.params.id);
    const cdEntryId = Number(req.query.cdEntryId);
    if (!Number.isInteger(releaseId) || releaseId <= 0) {
      res.status(400).json({ error: 'A valid Discogs release ID is required.' });
      return;
    }

    if (isStageEnvironment) {
      const context = getStageDiscogsContext(releaseId);
      if (!context) {
        res.status(404).json({ error: 'Stage Discogs release not found.' });
        return;
      }
      if (Number.isInteger(cdEntryId) && cdEntryId > 0) {
        await prisma.cdEntry.updateMany({
          where: { id: cdEntryId, discogsId: releaseId },
          data: { artistSummary: context.artistProfile, discogsNotes: context.description, discogsNotesSource: context.descriptionSource, discogsContextUpdatedAt: new Date(), genre: context.genre, style: context.style },
        });
      }
      res.json(context);
      return;
    }

    if (!discogsToken) {
      res.status(503).json({ error: 'Discogs authentication is not configured.' });
      return;
    }

    try {
      const context = await getDiscogsReleaseContext(releaseId, discogsToken);
      if (Number.isInteger(cdEntryId) && cdEntryId > 0) {
        await prisma.cdEntry.updateMany({
          where: { id: cdEntryId, discogsId: releaseId },
          data: {
            artistSummary: context.artistProfile,
            discogsNotes: context.description,
            discogsNotesSource: context.descriptionSource,
            discogsContextUpdatedAt: new Date(),
            genre: context.genre,
            style: context.style,
          },
        });
      }
      res.json(context);
    } catch (error) {
      console.error('Discogs release context lookup failed:', error);
      res.status(502).json({ error: 'Discogs could not provide release information right now.' });
    }
  });

  router.get('/api/ebay/active-listing-stats', async (req, res) => {
    const artist = String(req.query.artist || '').trim();
    const title = String(req.query.title || '').trim();
    const catalogNumber = String(req.query.catalogNumber || '').trim();
    if (!artist || !title) {
      res.status(400).json({ error: 'Artist and title are required for an eBay listing lookup.' });
      return;
    }

    if (!ebayClientId || !ebayClientSecret) {
      res.status(503).json({ error: 'eBay credentials are not configured.' });
      return;
    }

    try {
      res.json(await getEbayActiveListingStats(
        artist,
        title,
        catalogNumber || undefined,
        ebayClientId,
        ebayClientSecret,
        ebayMarketplaceId,
      ));
    } catch (error) {
      console.error('eBay active-listing lookup failed:', error);
      res.status(502).json({ error: 'eBay could not provide active listing prices right now.' });
    }
  });

  router.get('/api/ebay/sold-listing-stats', async (req, res) => {
    const artist = String(req.query.artist || '').trim();
    const title = String(req.query.title || '').trim();
    const catalogNumber = String(req.query.catalogNumber || '').trim();
    if (!artist || !title) {
      res.status(400).json({ error: 'Artist and title are required for an eBay sold-listing lookup.' });
      return;
    }

    if (!ebayClientId || !ebayClientSecret) {
      res.status(503).json({ error: 'eBay credentials are not configured.' });
      return;
    }

    try {
      res.json(await getEbaySoldListingStats(
        artist,
        title,
        catalogNumber || undefined,
        ebayClientId,
        ebayClientSecret,
        ebayMarketplaceId,
      ));
    } catch (error) {
      console.error('eBay sold-listing lookup failed:', error);
      res.status(502).json({ error: 'eBay could not provide sold-price history right now.' });
    }
  });

  router.get('/api/youtube/best-match', async (req, res) => {
    const artist = String(req.query.artist || '').trim();
    const album = String(req.query.album || '').trim();
    const track = String(req.query.track || '').trim();
    const trackDurationSeconds = Number(req.query.durationSeconds);
    if (!artist || !album || !track) {
      res.status(400).json({ error: 'Artist, album, and track are required for a YouTube match.' });
      return;
    }
    if (!youtubeApiKey) {
      res.status(503).json({ error: 'YouTube matching is not configured. Add YOUTUBE_API_KEY to backend/.env.' });
      return;
    }
    try {
      res.json({ videos: await findYouTubeMatches(
        artist,
        album,
        track,
        Number.isFinite(trackDurationSeconds) && trackDurationSeconds > 0 ? trackDurationSeconds : null,
        youtubeApiKey,
      ) });
    } catch (error) {
      console.error('YouTube best-match lookup failed:', error);
      res.status(502).json({ error: 'YouTube could not find a playable match right now.' });
    }
  });

  router.get('/api/cds/:id/youtube-track-matches', async (req, res) => {
    const entryId = Number(req.params.id);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      res.status(400).json({ error: 'A valid catalog entry ID is required.' });
      return;
    }
    res.json({ matches: await prisma.youTubeTrackMatch.findMany({ where: { cdEntryId: entryId } }) });
  });

  router.put('/api/cds/:id/youtube-track-matches', async (req, res) => {
    const entryId = Number(req.params.id);
    const { trackKey, videoId, videoTitle, videoUrl } = req.body as { trackKey?: string; videoId?: string; videoTitle?: string; videoUrl?: string };
    if (!Number.isInteger(entryId) || entryId <= 0 || !trackKey?.trim() || !videoId?.trim() || !videoTitle?.trim() || !videoUrl?.trim()) {
      res.status(400).json({ error: 'A catalog entry, track, and video details are required.' });
      return;
    }
    try {
      const match = await prisma.youTubeTrackMatch.upsert({
        where: { cdEntryId_trackKey: { cdEntryId: entryId, trackKey: trackKey.trim() } },
        create: { cdEntryId: entryId, trackKey: trackKey.trim(), videoId: videoId.trim(), videoTitle: videoTitle.trim(), videoUrl: videoUrl.trim() },
        update: { videoId: videoId.trim(), videoTitle: videoTitle.trim(), videoUrl: videoUrl.trim(), selectedAt: new Date() },
      });
      res.json(match);
    } catch (error) {
      console.error('YouTube track-match save failed:', error);
      res.status(404).json({ error: 'Catalog entry not found.' });
    }
  });

  return router;
}
