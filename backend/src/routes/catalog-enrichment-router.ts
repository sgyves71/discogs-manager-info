import { Router } from 'express';
import { CatalogEnrichmentService, type BackfillState } from '../services/catalog-enrichment-service.js';

type BackfillRegistration = {
  path: string;
  state: BackfillState;
  start: () => Promise<void>;
  runningError: string;
  canStart: () => boolean;
  unavailableError: string;
};

export function createCatalogEnrichmentRouter(catalogEnrichment: CatalogEnrichmentService, isStageEnvironment: boolean) {
  const router = Router();
  const registerBackfill = ({ path, state, start, runningError, canStart, unavailableError }: BackfillRegistration) => {
    router.get(path, (_req, res) => res.json(state));
    router.post(path, (_req, res) => {
      if (state.status === 'running') {
        res.status(409).json({ error: runningError });
        return;
      }
      if (!canStart()) {
        res.status(503).json({ error: unavailableError });
        return;
      }
      void start();
      res.status(202).json(state);
    });
  };

  registerBackfill({
    path: '/catalog-cover-backfill', state: catalogEnrichment.coverBackfill, start: () => catalogEnrichment.startCoverBackfill(),
    runningError: 'Cover-art backfill is already running.', canStart: () => catalogEnrichment.hasDiscogsAccess, unavailableError: 'Discogs authentication is not configured.',
  });
  registerBackfill({
    path: '/catalog-release-info-backfill', state: catalogEnrichment.releaseInfoBackfill, start: () => catalogEnrichment.startReleaseInfoBackfill(),
    runningError: 'Release-label backfill is already running.', canStart: () => catalogEnrichment.hasDiscogsAccess, unavailableError: 'Discogs authentication is not configured.',
  });
  registerBackfill({
    path: '/catalog-discogs-context-backfill', state: catalogEnrichment.contextBackfill, start: () => catalogEnrichment.startContextBackfill(),
    runningError: 'Discogs-context backfill is already running.', canStart: () => catalogEnrichment.hasDiscogsAccess, unavailableError: 'Discogs authentication is not configured.',
  });
  registerBackfill({
    path: '/catalog-genre-style-backfill', state: catalogEnrichment.genreStyleBackfill, start: () => catalogEnrichment.startGenreStyleBackfill(),
    runningError: 'Genre/style backfill is already running.', canStart: () => catalogEnrichment.hasDiscogsAccess, unavailableError: 'Discogs authentication is not configured.',
  });
  registerBackfill({
    path: '/catalog-discogs-market-stats-backfill', state: catalogEnrichment.marketStatsBackfill, start: () => catalogEnrichment.startMarketStatsBackfill(),
    runningError: 'Discogs market-statistics backfill is already running.', canStart: () => !isStageEnvironment, unavailableError: 'Live Discogs page scraping is disabled in Stage.',
  });

  return router;
}
