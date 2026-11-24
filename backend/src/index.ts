import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stageBackendConfig } from '../../scripts/stage-safety.mjs';
import { PrismaClient } from '@prisma/client';
import { getDiscogsReleaseCover } from './discogs.js';
import { createDiscogsCollectionClient, createStageDiscogsCollectionClient } from './discogs-collection-client.js';
import { normalizeStoredCatalogText } from './services/catalog-text.js';
import { createCatalogRouter } from './routes/catalog-router.js';
import { createMusicLibraryRouter } from './routes/music-library-router.js';
import { createReleaseIntegrationsRouter } from './routes/release-integrations-router.js';
import { createDiscogsSyncRouter } from './routes/discogs-sync-router.js';
import { CatalogEnrichmentService } from './services/catalog-enrichment-service.js';
import { CatalogStatisticsService } from './services/catalog-statistics-service.js';
import { DiscogsCoverLookupService } from './services/discogs-cover-lookup-service.js';
import { DiscogsCollectionSyncService } from './services/discogs-collection-sync-service.js';
import { LocalAlbumArtService } from './services/local-album-art-service.js';
import { createCatalogStatisticsRouter } from './routes/catalog-statistics-router.js';
import { createCatalogEnrichmentRouter } from './routes/catalog-enrichment-router.js';
import { createPlaybackRouter } from './routes/playback-router.js';
import { PlaybackQueueService } from './services/playback-queue-service.js';

const productionStartup = process.env.NODE_ENV === 'production';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
const isStageEnvironment = process.env.APP_ENV === 'stage';
const stageConfig = isStageEnvironment ? (() => {
  dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env.stage'), override: true });
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const config = stageBackendConfig(root, process.env);
  // Stage is deliberately isolated from external integrations and personal data.
  process.env.DISCOGS_TOKEN = '';
  process.env.EBAY_CLIENT_ID = '';
  process.env.EBAY_CLIENT_SECRET = '';
  process.env.YOUTUBE_API_KEY = '';
  return config;
})() : undefined;
if (!stageConfig) {
  if (!productionStartup) {
    throw new Error('The personal database requires explicit production startup. Use npm run dev for synthetic Stage.');
  }
  process.env.DATABASE_URL ??= 'file:./dev.db';
  if (process.env.DATABASE_URL !== 'file:./dev.db') {
    throw new Error('Production requires the configured personal database filename.');
  }
}

const app = express();
const databasePath = stageConfig?.database ?? fileURLToPath(new URL('../prisma/dev.db', import.meta.url));
const prisma = new PrismaClient({
  datasources: { db: { url: `file:${databasePath.replace(/\\/g, '/')}` } },
});
const localAlbumArtService = new LocalAlbumArtService();
const playbackQueueService = new PlaybackQueueService(prisma);
const port = stageConfig?.port ?? (process.env.PORT ? Number(process.env.PORT) : 3100);
const host = stageConfig?.host ?? (process.env.HOST?.trim() || undefined);
const discogsToken = process.env.DISCOGS_TOKEN?.trim();
const ebayClientId = process.env.EBAY_CLIENT_ID?.trim();
const ebayClientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
const ebayMarketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || 'EBAY_US';
const youtubeApiKey = process.env.YOUTUBE_API_KEY?.trim();
const catalogEnrichment = new CatalogEnrichmentService(prisma, discogsToken, isStageEnvironment);
const catalogStatistics = new CatalogStatisticsService({
  countEntries: () => prisma.cdEntry.count(),
  aggregateDiscogsMedian: async () => {
    const result = await prisma.cdEntry.aggregate({ where: { discogsMarketMedian: { not: null } }, _count: { discogsMarketMedian: true }, _sum: { discogsMarketMedian: true } });
    return { count: result._count.discogsMarketMedian, total: result._sum.discogsMarketMedian ?? 0 };
  },
  aggregateEstimatedValue: async () => {
    const result = await prisma.cdEntry.aggregate({ where: { estimatedValue: { not: null } }, _count: { estimatedValue: true }, _sum: { estimatedValue: true } });
    return { count: result._count.estimatedValue, total: result._sum.estimatedValue ?? 0 };
  },
  findStatisticsEntries: () => prisma.cdEntry.findMany({ select: { style: true, year: true } }),
});
const collectionClient = isStageEnvironment
  ? createStageDiscogsCollectionClient()
  : discogsToken ? createDiscogsCollectionClient(discogsToken) : undefined;
const discogsCollectionSync = new DiscogsCollectionSyncService(prisma, collectionClient);
const discogsCoverLookup = new DiscogsCoverLookupService((releaseId) => getDiscogsReleaseCover(releaseId, discogsToken!));

app.use(cors());
app.use(express.json());
app.use('/api/music-library/playback', createPlaybackRouter(playbackQueueService));
app.use('/api/catalog', createCatalogStatisticsRouter(catalogStatistics, prisma));
app.use('/api', createCatalogEnrichmentRouter(catalogEnrichment, isStageEnvironment));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (stageConfig) {
  const instance = randomUUID();
  app.get('/api/stage/identity', async (_req, res) => {
    try {
      const fixtures = await prisma.cdEntry.count({
        where: { artist: 'Stage Artist', discogsId: { in: [900001, 900002] } },
      });
      res.set('Cache-Control', 'no-store').status(fixtures === 2 ? 200 : 503)
        .json({ environment: 'stage', fixture: fixtures === 2 ? 'synthetic-catalog-v1' : null, instance });
    } catch {
      res.status(503).json({ error: 'Stage fixtures are unavailable.' });
    }
  });
}

app.use(createMusicLibraryRouter(prisma, discogsToken));
app.use(createDiscogsSyncRouter(discogsCollectionSync));
app.use(createCatalogRouter(prisma, catalogEnrichment, localAlbumArtService, discogsToken));
app.use(createReleaseIntegrationsRouter({
  prisma, catalogEnrichment, discogsCoverLookup, isStageEnvironment, discogsToken,
  ebayClientId, ebayClientSecret, ebayMarketplaceId, youtubeApiKey,
}));

const prepareCatalog = stageConfig ? Promise.resolve() : normalizeStoredCatalogText(prisma);
void prepareCatalog
  .catch((error) => console.error('Unable to normalize stored Discogs artist suffixes:', error))
  .finally(() => {
    const onListening = () => {
      console.log(`Backend listening on http://${host ?? 'localhost'}:${port}`);
    };
    const server = host ? app.listen(port, host, onListening) : app.listen(port, onListening);
    let stopping = false;
    const shutdown = (signal: string) => {
      if (stopping) return;
      stopping = true;
      console.log(`${signal} received. Shutting down backend...`);
      server.close(() => {
        void prisma.$disconnect().finally(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  });
