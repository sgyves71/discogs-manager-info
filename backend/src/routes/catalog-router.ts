import { Router } from 'express';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { cleanDiscogsText, getDiscogsReleaseCatalogInfo, stripDiscogsArtistDisambiguator } from '../discogs.js';
import { isDirectory, pathIsWithinRoot } from '../music-library.js';
import type { CatalogEnrichmentService } from '../services/catalog-enrichment-service.js';
import { catalogArtistSortName } from '../services/catalog-text.js';
import type { LocalAlbumArtService } from '../services/local-album-art-service.js';

const duplicateReleaseError = 'This exact Discogs release is already in your catalog.';

export function createCatalogRouter(
  prisma: PrismaClient,
  catalogEnrichment: CatalogEnrichmentService,
  localAlbumArtService: LocalAlbumArtService,
  discogsToken?: string,
) {
  const router = Router();

  function findDuplicateRelease(discogsId: number, excludingEntryId?: number) {
    return prisma.cdEntry.findFirst({
      where: { discogsId, ...(excludingEntryId === undefined ? {} : { NOT: { id: excludingEntryId } }) },
    });
  }

  router.get('/api/cds', async (req, res) => {
    const query = String(req.query.q || '').trim();
    const style = String(req.query.style || '').trim();
    const sort = String(req.query.sort || 'artist');
    const requestedPage = Number(req.query.page || 1);
    const requestedPageSize = Number(req.query.pageSize || 24);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isInteger(requestedPageSize) ? Math.min(Math.max(requestedPageSize, 12), 100) : 24;
    const filters = [];
    if (query) filters.push({
      OR: [
        { artist: { contains: query } },
        { title: { contains: query } },
        { catalogNumber: { contains: query } },
        { barcode: { contains: query } },
      ],
    });
    if (style) filters.push({ style: { contains: style } });
    const where = filters.length ? { AND: filters } : undefined;
    const orderBy = sort === 'discogs-median-desc'
      ? [{ discogsMarketMedian: 'desc' as const }, { artistSortName: 'asc' as const }, { title: 'asc' as const }]
      : sort === 'estimated-value-desc'
        ? [{ estimatedValue: 'desc' as const }, { artistSortName: 'asc' as const }, { title: 'asc' as const }]
        : [{ artistSortName: 'asc' as const }, { artist: 'asc' as const }, { title: 'asc' as const }];

    const [items, total] = await prisma.$transaction([
      prisma.cdEntry.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.cdEntry.count({ where }),
    ]);
    res.json({
      items: items.map(({ coverImageData, coverImageMimeType, ...item }) => ({ ...item, hasCover: Boolean(item.personalAlbumFolderPath || coverImageData && coverImageMimeType) })),
      total, page, pageSize,
    });
  });

  router.get('/api/cds/:id/cover', async (req, res) => {
    const entryId = Number(req.params.id);
    const entry = Number.isInteger(entryId) && entryId > 0
      ? await prisma.cdEntry.findUnique({ where: { id: entryId }, select: { coverImageData: true, coverImageMimeType: true, personalAlbumFolderPath: true } })
      : null;
    if (!entry) {
      res.status(404).end();
      return;
    }
    const library = entry.personalAlbumFolderPath ? await prisma.musicLibrary.findFirst({ orderBy: { id: 'asc' } }) : null;
    const folderPath = entry.personalAlbumFolderPath ? path.resolve(entry.personalAlbumFolderPath) : null;
    if (library && folderPath && pathIsWithinRoot(library.rootPath, folderPath) && await isDirectory(folderPath)) {
      const tracks = await prisma.musicLibraryTrack.findMany({
        where: { libraryId: library.id, filePath: { startsWith: `${folderPath}${path.sep}` } },
        select: { filePath: true },
        orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }, { filePath: 'asc' }],
      });
      const localArt = await localAlbumArtService.find(folderPath, tracks.map((track) => track.filePath));
      if (localArt) {
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.type(localArt.mimeType).send(localArt.data);
        return;
      }
    }
    if (!entry.coverImageData || !entry.coverImageMimeType) {
      res.status(404).end();
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(entry.coverImageMimeType).send(entry.coverImageData);
  });

  router.patch('/api/cds/:id/estimated-value', async (req, res) => {
    const entryId = Number(req.params.id);
    const estimatedValue = req.body?.estimatedValue;
    if (!Number.isInteger(entryId) || entryId <= 0 || (estimatedValue !== null && (!Number.isFinite(estimatedValue) || estimatedValue < 0))) {
      res.status(400).json({ error: 'Provide a valid non-negative estimated value, or clear it.' });
      return;
    }
    try {
      const entry = await prisma.cdEntry.update({
        where: { id: entryId },
        data: { estimatedValue: estimatedValue === null ? null : estimatedValue, estimatedValueIsManual: estimatedValue !== null, estimatedValueReviewedAt: new Date(), valueLastCheckedAt: null },
      });
      res.json(entry);
    } catch {
      res.status(404).json({ error: 'Catalog entry not found.' });
    }
  });

  router.patch('/api/cds/:id/details', async (req, res) => {
    const entryId = Number(req.params.id);
    const { title, artist, year, country, label, format, catalogNumber, barcode, mediaCondition, notes } = req.body as {
      title?: string; artist?: string; year?: number | null; country?: string | null; label?: string | null;
      format?: string | null; catalogNumber?: string | null; barcode?: string | null; mediaCondition?: string | null; notes?: string | null;
    };
    const normalizedTitle = typeof title === 'string' ? cleanDiscogsText(title) : '';
    const normalizedArtist = typeof artist === 'string' ? stripDiscogsArtistDisambiguator(artist) : '';
    const normalizedYear = year == null ? null : Number(year);
    if (!Number.isInteger(entryId) || entryId <= 0 || !normalizedTitle || !normalizedArtist || (normalizedYear != null && (normalizedYear < 1000 || normalizedYear > 9999))) {
      res.status(400).json({ error: 'Provide an artist, title, and a valid four-digit year when one is supplied.' });
      return;
    }
    const nullableText = (value: string | null | undefined) => typeof value === 'string' && value.trim() ? value.trim() : null;
    try {
      const entry = await prisma.cdEntry.update({
        where: { id: entryId },
        data: {
          title: normalizedTitle,
          artist: normalizedArtist,
          artistSortName: catalogArtistSortName(normalizedArtist),
          year: normalizedYear,
          country: nullableText(country),
          label: label ? cleanDiscogsText(label) || null : null,
          format: nullableText(format),
          catalogNumber: nullableText(catalogNumber),
          barcode: nullableText(barcode),
          mediaCondition: nullableText(mediaCondition),
          notes: nullableText(notes),
        },
      });
      res.json(entry);
    } catch {
      res.status(404).json({ error: 'Catalog entry not found.' });
    }
  });

  router.post('/api/cds', async (req, res) => {
    const { title, artist, year, country, label, format, discogsId, discogsUri, catalogNumber, barcode, mediaCondition, estimatedValueOverride, notes } = req.body as {
      title?: string;
      artist?: string;
      year?: number | null;
      country?: string | null;
      label?: string | null;
      format?: string | null;
      discogsId?: number | null;
      discogsUri?: string | null;
      catalogNumber?: string | null;
      barcode?: string | null;
      mediaCondition?: string | null;
      estimatedValueOverride?: number | null;
      notes?: string | null;
    };

    const normalizedArtist = artist ? stripDiscogsArtistDisambiguator(artist) : '';
    if (!title || !normalizedArtist) {
      res.status(400).json({ error: 'Title and artist are required' });
      return;
    }

    // Intentional Demo 3 regression: bypass the duplicate check on create.

    const hasManualEstimatedValue = typeof estimatedValueOverride === 'number'
      && Number.isFinite(estimatedValueOverride)
      && estimatedValueOverride >= 0;
    const normalizedMediaCondition = mediaCondition?.trim() || 'Very Good Plus (VG+)';
    let estimatedValue: number | null = hasManualEstimatedValue ? estimatedValueOverride : 15;
    let valueLastCheckedAt: Date | null = null;
    let releaseLabel = label?.trim() || null;
    let releaseCatalogNumber = catalogNumber?.trim() || null;
    let releaseBarcode = barcode?.trim() || null;

    if (discogsId && discogsToken) {
      try {
        const releaseInfo = await getDiscogsReleaseCatalogInfo(discogsId, discogsToken);
        releaseLabel = releaseInfo.label ?? releaseLabel;
        releaseCatalogNumber = releaseInfo.catalogNumber ?? releaseCatalogNumber;
        releaseBarcode = releaseInfo.barcode;
      } catch (error) {
        console.error('Discogs release-label lookup failed:', error);
      }
    }


    const created = await prisma.cdEntry.create({
      data: {
        title,
        artist: normalizedArtist,
        artistSortName: catalogArtistSortName(normalizedArtist),
        year: year ?? null,
        country: country ?? null,
        label: releaseLabel,
        format: format ?? null,
        discogsId: discogsId ?? null,
        discogsUri: discogsUri ?? null,
        catalogNumber: releaseCatalogNumber,
        barcode: releaseBarcode,
        mediaCondition: normalizedMediaCondition,
        estimatedValue,
        estimatedValueIsManual: hasManualEstimatedValue,
        estimatedValueReviewedAt: hasManualEstimatedValue ? new Date() : null,
        valueLastCheckedAt,
        notes: notes ?? null,
      },
    });
    let hasCover = false;
    if (discogsId) {
      try {
        hasCover = await catalogEnrichment.storeCover(created.id, discogsId);
      } catch (error) {
        console.error('Catalog cover thumbnail save failed:', error);
      }
      try {
        await catalogEnrichment.storeContext(created.id, discogsId);
      } catch (error) {
        console.error('Catalog Discogs context save failed:', error);
      }
      try {
        await catalogEnrichment.refreshMarketStats(created.id, discogsId);
      } catch (error) {
        console.error('Catalog market-statistics refresh failed:', error);
      }
    }
    const storedEntry = await prisma.cdEntry.findUnique({ where: { id: created.id } });
    res.status(201).json({ ...(storedEntry ?? created), coverImageData: undefined, coverImageMimeType: undefined, hasCover });
  });

  router.patch('/api/cds/:id', async (req, res) => {
    const entryId = Number(req.params.id);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      res.status(400).json({ error: 'A valid catalog entry ID is required.' });
      return;
    }

    const existing = await prisma.cdEntry.findUnique({ where: { id: entryId } });
    if (!existing) {
      res.status(404).json({ error: 'Catalog entry not found.' });
      return;
    }

    const { title, artist, year, country, label, format, discogsId, discogsUri, catalogNumber, barcode, mediaCondition, estimatedValueOverride, notes } = req.body as {
      title?: string; artist?: string; year?: number | null; country?: string | null; label?: string | null;
      format?: string | null; discogsId?: number | null; discogsUri?: string | null; catalogNumber?: string | null; barcode?: string | null; mediaCondition?: string | null;
      estimatedValueOverride?: number | null; notes?: string | null;
    };

    const normalizedArtist = artist ? stripDiscogsArtistDisambiguator(artist) : '';
    if (!title || !normalizedArtist || !discogsId) {
      res.status(400).json({ error: 'A title, artist, and corrected Discogs release are required.' });
      return;
    }

    const existingDiscogsEntry = await findDuplicateRelease(discogsId, entryId);
    if (existingDiscogsEntry) {
      res.status(409).json({ error: duplicateReleaseError });
      return;
    }

    const hasManualEstimatedValue = typeof estimatedValueOverride === 'number'
      && Number.isFinite(estimatedValueOverride) && estimatedValueOverride >= 0;
    const normalizedMediaCondition = mediaCondition?.trim() || 'Very Good Plus (VG+)';
    let estimatedValue: number | null = hasManualEstimatedValue ? estimatedValueOverride : 15;
    let valueLastCheckedAt: Date | null = null;
    let releaseLabel = label?.trim() || null;
    let releaseCatalogNumber = catalogNumber?.trim() || null;
    let releaseBarcode = barcode?.trim() || null;
    if (discogsToken) {
      try {
        const releaseInfo = await getDiscogsReleaseCatalogInfo(discogsId, discogsToken);
        releaseLabel = releaseInfo.label ?? releaseLabel;
        releaseCatalogNumber = releaseInfo.catalogNumber ?? releaseCatalogNumber;
        releaseBarcode = releaseInfo.barcode;
      } catch (error) {
        console.error('Discogs corrected release-label lookup failed:', error);
      }
    }

    const releaseChanged = existing.discogsId !== discogsId;
    const updated = await prisma.$transaction(async (transaction) => {
      if (releaseChanged) {
        await transaction.personalTrackMatch.deleteMany({ where: { cdEntryId: entryId } });
        await transaction.youTubeTrackMatch.deleteMany({ where: { cdEntryId: entryId } });
      }
      return transaction.cdEntry.update({
        where: { id: entryId },
        data: {
        title, artist: normalizedArtist, artistSortName: catalogArtistSortName(normalizedArtist), year: year ?? null, country: country ?? null, label: releaseLabel, format: format ?? null,
        discogsId, discogsUri: discogsUri ?? null, catalogNumber: releaseCatalogNumber, barcode: releaseBarcode, mediaCondition: normalizedMediaCondition,
        estimatedValue, valueLastCheckedAt, notes: notes ?? null,
        estimatedValueIsManual: hasManualEstimatedValue,
        estimatedValueReviewedAt: hasManualEstimatedValue ? new Date() : null,
        ...(releaseChanged ? {
          discogsCollectionSyncStatus: 'NOT_SYNCED',
          discogsCollectionInstanceId: null,
          discogsCollectionSyncedAt: null,
          coverImageData: null,
          coverImageMimeType: null,
          coverImageUpdatedAt: null,
          artistSummary: null,
          discogsNotes: null,
          discogsNotesSource: null,
          discogsContextUpdatedAt: null,
          discogsLastSoldAt: null,
          discogsMarketLow: null,
          discogsMarketMedian: null,
          discogsMarketHigh: null,
          discogsMarketCurrency: null,
          discogsMarketStatsCheckedAt: null,
          } : {}),
        },
      });
    });
    let hasCover = Boolean(updated.coverImageData && updated.coverImageMimeType);
    if (!hasCover || existing.discogsId !== discogsId) {
      try {
        hasCover = await catalogEnrichment.storeCover(updated.id, discogsId);
      } catch (error) {
        console.error('Corrected catalog cover thumbnail save failed:', error);
      }
    }
    try {
      await catalogEnrichment.storeContext(updated.id, discogsId);
    } catch (error) {
      console.error('Corrected catalog Discogs context save failed:', error);
    }
    try {
      await catalogEnrichment.refreshMarketStats(updated.id, discogsId);
    } catch (error) {
      console.error('Corrected catalog market-statistics refresh failed:', error);
    }
    const storedEntry = await prisma.cdEntry.findUnique({ where: { id: updated.id } });
    res.json({ ...(storedEntry ?? updated), coverImageData: undefined, coverImageMimeType: undefined, hasCover });
  });

  router.delete('/api/cds/:id', async (req, res) => {
    const entryId = Number(req.params.id);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      res.status(400).json({ error: 'A valid catalog entry ID is required.' });
      return;
    }

    try {
      await prisma.cdEntry.delete({ where: { id: entryId } });
      res.status(204).end();
    } catch (error) {
      console.error('Catalog entry deletion failed:', error);
      res.status(404).json({ error: 'Catalog entry not found.' });
    }
  });

  return router;
}
