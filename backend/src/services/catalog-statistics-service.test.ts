import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogStatisticsService, type CatalogStatisticsRepository } from './catalog-statistics-service.js';

function createRepository(entries: Array<{ style: string | null; year: number | null }>): CatalogStatisticsRepository {
  return {
    countEntries: async () => entries.length,
    aggregateDiscogsMedian: async () => ({ count: 2, total: 38.5 }),
    aggregateEstimatedValue: async () => ({ count: entries.length, total: 60 }),
    findStatisticsEntries: async () => entries,
  };
}

test('CatalogStatisticsService Groups Styles and Decades Deterministically', async () => {
  const service = new CatalogStatisticsService(createRepository([
    { style: 'Heavy Metal, Speed Metal', year: 1984 },
    { style: 'Heavy Metal', year: 1989 },
    { style: null, year: 2001 },
    { style: 'Hard Rock', year: null },
  ]));

  const statistics = await service.getStatistics();

  assert.deepEqual(statistics.discogsMedian, { count: 2, total: 38.5 });
  assert.deepEqual(statistics.styles, [
    { style: 'Heavy Metal', count: 2, percentage: 50 },
    { style: 'Hard Rock', count: 1, percentage: 25 },
    { style: 'Speed Metal', count: 1, percentage: 25 },
    { style: 'Uncategorized', count: 1, percentage: 25 },
  ]);
  assert.deepEqual(statistics.decades, [
    { decade: '1980s', count: 2, percentage: 50 },
    { decade: '2000s', count: 1, percentage: 25 },
    { decade: 'Unknown Year', count: 1, percentage: 25 },
  ]);
});

test('CatalogStatisticsService Handles an Empty Catalog', async () => {
  const statistics = await new CatalogStatisticsService(createRepository([])).getStatistics();

  assert.deepEqual(statistics.styles, []);
  assert.deepEqual(statistics.decades, []);
  assert.equal(statistics.totalEntries, 0);
});
