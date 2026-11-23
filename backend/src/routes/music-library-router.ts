import { Router } from 'express';
import type express from 'express';
import path from 'node:path';
import { createReadStream, promises as fs } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { contentTypeForAudioFile, isDirectory, pathIsWithinRoot } from '../music-library.js';
import { MusicLibraryScanService } from '../services/music-library-scan-service.js';
import { PersonalTrackMatchService } from '../services/personal-track-match-service.js';

function sendMatchResult(
  res: express.Response,
  result: { kind: 'resolved'; value: unknown } | { kind: 'invalid' | 'missing' | 'unavailable'; error: string },
) {
  if (result.kind === 'resolved') {
    res.json(result.value);
    return;
  }
  const status = { invalid: 400, missing: 404, unavailable: 502 };
  res.status(status[result.kind]).json({ error: result.error });
}

export function createMusicLibraryRouter(prisma: PrismaClient, discogsToken?: string, scans = new MusicLibraryScanService(prisma)) {
  const router = Router();
  const trackMatches = new PersonalTrackMatchService(prisma);

  const playbackDiagnostics: { at: string; trackId: number; method: string; range: string | null; status: number; contentRange: string | null; userAgent: string | null }[] = [];

  function recordPlaybackDiagnostic(req: express.Request, res: express.Response, trackId: number) {
    playbackDiagnostics.unshift({
      at: new Date().toISOString(),
      trackId,
      method: req.method,
      range: req.headers.range ?? null,
      status: res.statusCode,
      contentRange: res.getHeader('Content-Range')?.toString() ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    playbackDiagnostics.splice(20);
  }

  async function getMusicLibrary() {
    return prisma.musicLibrary.findFirst({ orderBy: { id: 'asc' } });
  }

  router.get('/api/music-library', async (_req, res) => {
    const library = await getMusicLibrary();
    const trackCount = library ? await prisma.musicLibraryTrack.count({ where: { libraryId: library.id } }) : 0;
    res.json({
      rootPath: library?.rootPath ?? null,
      lastScannedAt: library?.lastScannedAt ?? null,
      trackCount,
      scan: scans.libraryScan,
      catalogLocationScan: scans.catalogLocationScan,
    });
  });

  router.put('/api/music-library', async (req, res) => {
    const requestedPath = String(req.body?.rootPath || '').trim();
    if (!requestedPath || !path.isAbsolute(requestedPath)) {
      res.status(400).json({ error: 'Choose an absolute folder path for your music library.' });
      return;
    }
    const rootPath = path.resolve(requestedPath);
    if (!await isDirectory(rootPath)) {
      res.status(400).json({ error: 'That music library folder is not available on this PC.' });
      return;
    }
    const existing = await getMusicLibrary();
    const library = existing
      ? await prisma.musicLibrary.update({ where: { id: existing.id }, data: { rootPath, lastScannedAt: null } })
      : await prisma.musicLibrary.create({ data: { rootPath } });
    if (existing && existing.rootPath !== rootPath) {
      await prisma.musicLibraryTrack.deleteMany({ where: { libraryId: library.id } });
    }
    scans.resetAfterFolderChange();
    res.json({ rootPath: library.rootPath, lastScannedAt: library.lastScannedAt });
  });

  router.post('/api/music-library/scan', async (_req, res, next) => {
    try {
      const result = await scans.startLibraryScan();
      if (result.kind === 'accepted') {
        res.status(202).json({ scan: result.scan });
        return;
      }
      res.status(result.kind === 'conflict' ? 409 : 400).json({ error: result.error });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/music-library/folders/artists', async (_req, res) => {
    const library = await getMusicLibrary();
    if (!library) {
      res.status(404).json({ error: 'Choose and scan a music library folder first.' });
      return;
    }
    const tracks = await prisma.musicLibraryTrack.findMany({ where: { libraryId: library.id }, select: { filePath: true, artist: true } });
    const folders = new Map<string, { folderPath: string; name: string; trackCount: number }>();
    for (const track of tracks) {
      const folderPath = path.dirname(path.dirname(track.filePath));
      if (folderPath !== path.resolve(library.rootPath) && !pathIsWithinRoot(library.rootPath, folderPath)) continue;
      const current = folders.get(folderPath);
      folders.set(folderPath, { folderPath, name: path.basename(folderPath) || track.artist, trackCount: (current?.trackCount ?? 0) + 1 });
    }
    res.json({ folders: [...folders.values()].sort((left, right) => left.name.localeCompare(right.name) || left.folderPath.localeCompare(right.folderPath)) });
  });

  router.get('/api/music-library/folders/albums', async (req, res) => {
    const artistFolderPath = String(req.query.artistFolderPath || '').trim();
    const library = await getMusicLibrary();
    if (!library || !artistFolderPath) {
      res.status(400).json({ error: 'Choose an indexed artist folder first.' });
      return;
    }
    const resolvedArtistFolder = path.resolve(artistFolderPath);
    if (resolvedArtistFolder !== path.resolve(library.rootPath) && !pathIsWithinRoot(library.rootPath, resolvedArtistFolder)) {
      res.status(400).json({ error: 'Choose an artist folder inside the configured music library.' });
      return;
    }
    const tracks = await prisma.musicLibraryTrack.findMany({ where: { libraryId: library.id, filePath: { startsWith: `${resolvedArtistFolder}${path.sep}` } }, select: { filePath: true, album: true } });
    const folders = new Map<string, { folderPath: string; name: string; album: string; trackCount: number }>();
    for (const track of tracks) {
      const folderPath = path.dirname(track.filePath);
      const current = folders.get(folderPath);
      folders.set(folderPath, { folderPath, name: path.basename(folderPath), album: track.album, trackCount: (current?.trackCount ?? 0) + 1 });
    }
    res.json({ folders: [...folders.values()].sort((left, right) => left.album.localeCompare(right.album) || left.name.localeCompare(right.name)) });
  });

  router.get('/api/music-library/matches/find', async (req, res, next) => {
    const cdEntryId = Number(req.query.cdEntryId);
    const trackKey = String(req.query.trackKey || '').trim();
    const trackTitle = String(req.query.trackTitle || '').trim();
    const sequenceNumber = Number(req.query.sequenceNumber);
    const validSequenceNumber = Number.isInteger(sequenceNumber) && sequenceNumber > 0 ? sequenceNumber : null;
    if (!Number.isInteger(cdEntryId) || cdEntryId <= 0 || !trackKey || !trackTitle) {
      res.status(400).json({ error: 'A catalog entry and track are required.' });
      return;
    }
    try {
      sendMatchResult(res, await trackMatches.findTrack(cdEntryId, { trackKey, title: trackTitle, sequenceNumber: validSequenceNumber ?? undefined }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/music-library/albums/find', async (req, res, next) => {
    const cdEntryId = Number(req.query.cdEntryId);
    if (!Number.isInteger(cdEntryId) || cdEntryId <= 0) {
      res.status(400).json({ error: 'A valid catalog entry is required.' });
      return;
    }
    try {
      sendMatchResult(res, await trackMatches.findAlbums(cdEntryId));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/api/cds/:id/personal-album-folder', async (req, res, next) => {
    const entryId = Number(req.params.id);
    const folderPath = typeof req.body?.folderPath === 'string' ? req.body.folderPath.trim() : null;
    if (!Number.isInteger(entryId) || entryId <= 0 || (req.body?.folderPath != null && !folderPath)) {
      res.status(400).json({ error: 'Provide a valid album folder path, or null to clear the mapping.' });
      return;
    }
    try {
      sendMatchResult(res, await trackMatches.setAlbumFolder(entryId, folderPath));
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/cds/:id/personal-album-folder/validate', async (req, res, next) => {
    const entryId = Number(req.params.id);
    const folderPath = typeof req.body?.folderPath === 'string' ? req.body.folderPath.trim() : '';
    if (!Number.isInteger(entryId) || entryId <= 0 || !folderPath) {
      res.status(400).json({ error: 'Choose an album folder to validate.' });
      return;
    }
    try {
      sendMatchResult(res, await trackMatches.validateAlbumFolder(entryId, folderPath, discogsToken));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/cds/:id/personal-track-matches', async (req, res) => {
    const cdEntryId = Number(req.params.id);
    if (!Number.isInteger(cdEntryId) || cdEntryId <= 0) {
      res.status(400).json({ error: 'A valid catalog entry ID is required.' });
      return;
    }
    res.json({ matches: await prisma.personalTrackMatch.findMany({ where: { cdEntryId }, include: { libraryTrack: true } }) });
  });

  router.post('/api/music-library/catalog-personal-locations/scan', async (_req, res, next) => {
    try {
      const result = await scans.startCatalogLocationScan();
      if (result.kind === 'accepted') {
        res.status(202).json({ scan: result.scan });
        return;
      }
      res.status(result.kind === 'conflict' ? 409 : 400).json({ error: result.error });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/cds/:id/personal-track-matches/sync', async (req, res, next) => {
    const cdEntryId = Number(req.params.id);
    const tracks = Array.isArray(req.body?.tracks)
      ? req.body.tracks
        .map((track: unknown) => {
          const candidate = track as { trackKey?: unknown; title?: unknown; sequenceNumber?: unknown };
          const sequenceNumber = Number(candidate.sequenceNumber);
          return {
            trackKey: String(candidate.trackKey ?? '').trim(),
            title: String(candidate.title ?? '').trim(),
            sequenceNumber: Number.isInteger(sequenceNumber) && sequenceNumber > 0 ? sequenceNumber : undefined,
          };
        })
        .filter((track: { trackKey: string; title: string }) => track.trackKey && track.title)
      : [];
    if (!Number.isInteger(cdEntryId) || cdEntryId <= 0 || !tracks.length) {
      res.status(400).json({ error: 'A catalog entry and at least one track are required.' });
      return;
    }

    try {
      sendMatchResult(res, await trackMatches.sync(cdEntryId, tracks));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/music-library/tracks/:id/stream', async (req, res) => {
    const trackId = Number(req.params.id);
    res.once('finish', () => recordPlaybackDiagnostic(req, res, trackId));
    const libraryTrack = Number.isInteger(trackId) && trackId > 0
      ? await prisma.musicLibraryTrack.findUnique({ where: { id: trackId }, include: { library: true } })
      : null;
    if (!libraryTrack || !pathIsWithinRoot(libraryTrack.library.rootPath, libraryTrack.filePath)) {
      res.status(404).end();
      return;
    }
    try {
      const fileStats = await fs.stat(libraryTrack.filePath);
      const fileSize = fileStats.size;
      const range = req.headers.range;
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', contentTypeForAudioFile(libraryTrack.filePath));
      res.setHeader('Content-Disposition', 'inline');
      if (!range) {
        res.setHeader('Content-Length', fileSize);
        const stream = createReadStream(libraryTrack.filePath);
        stream.on('error', () => res.destroy());
        stream.pipe(res);
        return;
      }
      const matchedRange = /^bytes=(\d*)-(\d*)$/u.exec(range);
      const requestedStart = matchedRange?.[1];
      const requestedEnd = matchedRange?.[2];
      const suffixLength = !requestedStart && requestedEnd ? Number(requestedEnd) : null;
      const start = requestedStart ? Number(requestedStart) : suffixLength ? Math.max(fileSize - suffixLength, 0) : 0;
      // Browsers, including Chrome on iPhone, may request a range that extends
      // beyond a short file. HTTP range semantics require us to serve the
      // available portion rather than reject that otherwise valid request.
      const end = requestedStart && requestedEnd ? Math.min(Number(requestedEnd), fileSize - 1) : fileSize - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', end - start + 1);
      const stream = createReadStream(libraryTrack.filePath, { start, end });
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch {
      res.status(404).end();
    }
  });

  router.get('/api/music-library/playback-diagnostics', (_req, res) => {
    res.json({ requests: playbackDiagnostics });
  });

  return router;
}
