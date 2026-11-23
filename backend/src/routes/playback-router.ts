import { Router } from 'express';
import type { PlaybackDirection, PlaybackQueueService } from '../services/playback-queue-service.js';

export function createPlaybackRouter(service: PlaybackQueueService): Router {
  const router = Router();
  const register = (direction: PlaybackDirection) => router.get(`/${direction}`, async (req, res, next) => {
    const catalogEntryId = Number(req.query.cdEntryId);
    const trackId = Number(req.query.trackId);
    if (!Number.isInteger(catalogEntryId) || catalogEntryId <= 0 || !Number.isInteger(trackId) || trackId <= 0) {
      res.status(400).json({ error: 'The current catalog entry and local track are required.' });
      return;
    }
    try {
      res.json({ [direction]: await service.findAdjacent(catalogEntryId, trackId, direction) });
    } catch (error) {
      if (error instanceof Error && error.message === 'CURRENT_TRACK_NOT_FOUND') {
        res.status(404).json({ error: 'The current local track was not found.' });
        return;
      }
      next(error);
    }
  });
  register('next');
  register('previous');
  return router;
}
