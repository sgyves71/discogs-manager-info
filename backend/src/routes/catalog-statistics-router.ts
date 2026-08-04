import { Router } from 'express';
import type { CatalogStatisticsService } from '../services/catalog-statistics-service.js';

type CatalogStylesRepository = {
  cdEntry: {
    findMany: (args: { select: { style: true } }) => Promise<Array<{ style: string | null }>>;
  };
};

export function createCatalogStatisticsRouter(
  catalogStatistics: CatalogStatisticsService,
  repository: CatalogStylesRepository,
) {
  const router = Router();

  router.get('/statistics', async (_req, res) => {
    res.json(await catalogStatistics.getStatistics());
  });

  router.get('/styles', async (_req, res) => {
    const entries = await repository.cdEntry.findMany({ select: { style: true } });
    const styles = [...new Set(entries.flatMap((entry) => entry.style?.split(',').map((style) => style.trim()).filter(Boolean) ?? []))]
      .sort((left, right) => left.localeCompare(right));
    res.json({ styles });
  });

  return router;
}
