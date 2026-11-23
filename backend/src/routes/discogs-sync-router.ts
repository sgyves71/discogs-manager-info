import { Router } from 'express';
import type { DiscogsCollectionSyncService } from '../services/discogs-collection-sync-service.js';

export function createDiscogsSyncRouter(discogsCollectionSync: DiscogsCollectionSyncService) {
  const router = Router();

  router.get('/api/discogs/collection-sync', async (_req, res) => {
    res.json({ ...(await discogsCollectionSync.getPreview()), sync: discogsCollectionSync.state });
  });

  router.post('/api/discogs/collection-sync', async (_req, res) => {
    if (discogsCollectionSync.state.status === 'running') {
      res.status(409).json({ error: 'A Discogs collection sync is already running.' });
      return;
    }
    const preview = await discogsCollectionSync.getPreview();
    if (!preview.configured) {
      res.status(503).json({ error: 'Discogs authentication is not configured.' });
      return;
    }
    void discogsCollectionSync.start().catch((error) => console.error('Discogs collection sync failed:', error));
    res.status(202).json(discogsCollectionSync.state);
  });

  return router;
}
