import { Router } from 'express';
import type express from 'express';
import path from 'node:path';
import { createReadStream, promises as fs } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { getDiscogsReleaseTracklist } from '../discogs.js';
import { artistSearchFallbacks, contentTypeForAudioFile, isDirectory, normalizeMusicText, pathIsWithinRoot, readMusicFileMetadata, scoreMusicTextMatch, scoreMusicTitleMatch, walkAudioFiles } from '../music-library.js';
import { physicalTrackKeys } from '../personal-track-matching.js';

export function createMusicLibraryRouter(prisma: PrismaClient, discogsToken?: string) {
  const router = Router();

  const libraryScanState: { status: 'idle' | 'scanning' | 'complete' | 'failed'; scannedFiles: number; indexedFiles: number; skippedFiles: number; error: string | null } = {
    status: 'idle', scannedFiles: 0, indexedFiles: 0, skippedFiles: 0, error: null,
  };
  const catalogPersonalLocationScanState: { status: 'idle' | 'scanning' | 'complete' | 'failed'; total: number; processed: number; matched: number; alreadyMapped: number; unmatched: number; error: string | null } = {
    status: 'idle', total: 0, processed: 0, matched: 0, alreadyMapped: 0, unmatched: 0, error: null,
  };
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

  async function findArtistLibraryTracks(libraryId: number, artist: string) {
    const normalizedArtist = normalizeMusicText(artist);
    const exactMatches = await prisma.musicLibraryTrack.findMany({
      where: { libraryId, normalizedArtist },
      orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
    });
    if (exactMatches.length) return exactMatches;
    for (const shortenedArtist of artistSearchFallbacks(artist)) {
      const fallbackMatches = await prisma.musicLibraryTrack.findMany({
        where: { libraryId, normalizedArtist: { startsWith: shortenedArtist } },
        orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
      });
      if (fallbackMatches.length) return fallbackMatches;
    }
    const broadCandidates = await prisma.musicLibraryTrack.findMany({
      where: { libraryId },
      orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
    });
    return broadCandidates.filter((candidate) => scoreMusicTextMatch(artist, candidate.artist) >= 0.7);
  }

  async function scanCatalogPersonalLocations(libraryId: number) {
    catalogPersonalLocationScanState.status = 'scanning';
    catalogPersonalLocationScanState.processed = 0;
    catalogPersonalLocationScanState.matched = 0;
    catalogPersonalLocationScanState.alreadyMapped = 0;
    catalogPersonalLocationScanState.unmatched = 0;
    catalogPersonalLocationScanState.error = null;
    try {
      const [entries, libraryTracks] = await Promise.all([
        prisma.cdEntry.findMany({ select: { id: true, artist: true, title: true, personalAlbumFolderPath: true }, orderBy: { id: 'asc' } }),
        prisma.musicLibraryTrack.findMany({ where: { libraryId }, select: { filePath: true, artist: true, album: true, normalizedArtist: true, trackNumber: true } }),
      ]);
      catalogPersonalLocationScanState.total = entries.length;
      const tracksByArtist = new Map<string, typeof libraryTracks>();
      for (const track of libraryTracks) {
        const matches = tracksByArtist.get(track.normalizedArtist) ?? [];
        matches.push(track);
        tracksByArtist.set(track.normalizedArtist, matches);
      }
      for (const entry of entries) {
        const existingFolder = entry.personalAlbumFolderPath ? path.resolve(entry.personalAlbumFolderPath) : null;
        const hasExistingFolder = existingFolder && libraryTracks.some((track) => path.resolve(track.filePath).startsWith(`${existingFolder}${path.sep}`));
        if (hasExistingFolder) {
          catalogPersonalLocationScanState.alreadyMapped += 1;
        } else {
          const normalizedArtist = normalizeMusicText(entry.artist);
          const artistCandidates = tracksByArtist.get(normalizedArtist)
            ?? libraryTracks.filter((track) => scoreMusicTextMatch(entry.artist, track.artist) >= 0.7);
          const albumMatch = artistCandidates
            .map((track) => ({ track, albumScore: scoreMusicTitleMatch(entry.title, track.album) }))
            .filter(({ albumScore }) => albumScore >= 0.55)
            .sort((left, right) => right.albumScore - left.albumScore || (left.track.trackNumber ?? 0) - (right.track.trackNumber ?? 0))[0]?.track;
          if (albumMatch) {
            await prisma.cdEntry.update({
              where: { id: entry.id },
              data: { personalAlbumFolderPath: path.dirname(albumMatch.filePath), personalAlbumFolderMappedAt: new Date() },
            });
            catalogPersonalLocationScanState.matched += 1;
          } else {
            catalogPersonalLocationScanState.unmatched += 1;
          }
        }
        catalogPersonalLocationScanState.processed += 1;
        if (catalogPersonalLocationScanState.processed % 25 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
      }
      catalogPersonalLocationScanState.status = 'complete';
    } catch (error) {
      catalogPersonalLocationScanState.status = 'failed';
      catalogPersonalLocationScanState.error = error instanceof Error ? error.message : 'Unable to match the catalog to the music library.';
    }
  }

  async function scanMusicLibrary(libraryId: number, rootPath: string) {
    const scanStartedAt = new Date();
    libraryScanState.status = 'scanning';
    libraryScanState.scannedFiles = 0;
    libraryScanState.indexedFiles = 0;
    libraryScanState.skippedFiles = 0;
    libraryScanState.error = null;
    catalogPersonalLocationScanState.status = 'idle';
    catalogPersonalLocationScanState.total = 0;
    catalogPersonalLocationScanState.processed = 0;
    catalogPersonalLocationScanState.matched = 0;
    catalogPersonalLocationScanState.alreadyMapped = 0;
    catalogPersonalLocationScanState.unmatched = 0;
    catalogPersonalLocationScanState.error = null;
    try {
      await walkAudioFiles(rootPath, async (filePath) => {
        libraryScanState.scannedFiles += 1;
        try {
          const metadata = await readMusicFileMetadata(filePath);
          if (!metadata.artist || !metadata.album || !metadata.title) {
            libraryScanState.skippedFiles += 1;
            return;
          }
          await prisma.musicLibraryTrack.upsert({
            where: { filePath },
            create: {
              libraryId, filePath, ...metadata,
              normalizedArtist: normalizeMusicText(metadata.artist),
              normalizedAlbum: normalizeMusicText(metadata.album),
              normalizedTitle: normalizeMusicText(metadata.title),
              indexedAt: scanStartedAt,
            },
            update: {
              libraryId, ...metadata,
              normalizedArtist: normalizeMusicText(metadata.artist),
              normalizedAlbum: normalizeMusicText(metadata.album),
              normalizedTitle: normalizeMusicText(metadata.title),
              indexedAt: scanStartedAt,
            },
          });
          libraryScanState.indexedFiles += 1;
        } catch {
          libraryScanState.skippedFiles += 1;
        }
      });
      await prisma.musicLibraryTrack.deleteMany({ where: { libraryId, indexedAt: { lt: scanStartedAt } } });
      await prisma.musicLibrary.update({ where: { id: libraryId }, data: { lastScannedAt: new Date() } });
      await scanCatalogPersonalLocations(libraryId);
      libraryScanState.status = 'complete';
    } catch (error) {
      libraryScanState.status = 'failed';
      libraryScanState.error = error instanceof Error ? error.message : 'Unable to scan the music library.';
    }
  }

  router.get('/api/music-library', async (_req, res) => {
    const library = await getMusicLibrary();
    const trackCount = library ? await prisma.musicLibraryTrack.count({ where: { libraryId: library.id } }) : 0;
    res.json({
      rootPath: library?.rootPath ?? null,
      lastScannedAt: library?.lastScannedAt ?? null,
      trackCount,
      scan: libraryScanState,
      catalogLocationScan: catalogPersonalLocationScanState,
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
    libraryScanState.status = 'idle';
    libraryScanState.scannedFiles = 0;
    libraryScanState.indexedFiles = 0;
    libraryScanState.skippedFiles = 0;
    libraryScanState.error = null;
    catalogPersonalLocationScanState.status = 'idle';
    res.json({ rootPath: library.rootPath, lastScannedAt: library.lastScannedAt });
  });

  router.post('/api/music-library/scan', async (_req, res) => {
    const library = await getMusicLibrary();
    if (!library) {
      res.status(400).json({ error: 'Choose a music library folder first.' });
      return;
    }
    if (libraryScanState.status === 'scanning') {
      res.status(409).json({ error: 'A music-library scan is already running.' });
      return;
    }
    if (catalogPersonalLocationScanState.status === 'scanning') {
      res.status(409).json({ error: 'Wait for catalog local-copy matching to finish before rescanning the music library.' });
      return;
    }
    if (!await isDirectory(library.rootPath)) {
      res.status(400).json({ error: 'The configured music library folder is currently unavailable.' });
      return;
    }
    void scanMusicLibrary(library.id, library.rootPath);
    res.status(202).json({ scan: libraryScanState });
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

  router.get('/api/music-library/matches/find', async (req, res) => {
    const cdEntryId = Number(req.query.cdEntryId);
    const trackKey = String(req.query.trackKey || '').trim();
    const trackTitle = String(req.query.trackTitle || '').trim();
    const sequenceNumber = Number(req.query.sequenceNumber);
    const validSequenceNumber = Number.isInteger(sequenceNumber) && sequenceNumber > 0 ? sequenceNumber : null;
    if (!Number.isInteger(cdEntryId) || cdEntryId <= 0 || !trackKey || !trackTitle) {
      res.status(400).json({ error: 'A catalog entry and track are required.' });
      return;
    }
    const [library, entry] = await Promise.all([getMusicLibrary(), prisma.cdEntry.findUnique({ where: { id: cdEntryId } })]);
    if (!library || !entry) {
      res.status(404).json({ error: library ? 'Catalog entry not found.' : 'Choose and scan a music library folder first.' });
      return;
    }
    const mappedFolderPath = entry.personalAlbumFolderPath ? path.resolve(entry.personalAlbumFolderPath) : null;
    const mappedCandidates = mappedFolderPath
      ? await prisma.musicLibraryTrack.findMany({ where: { libraryId: library.id, filePath: { startsWith: `${mappedFolderPath}${path.sep}` } }, orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }] })
      : [];
    const artistCandidates = mappedCandidates.length ? mappedCandidates : await findArtistLibraryTracks(library.id, entry.artist);
    const rankedCandidates = artistCandidates
      .map((candidate) => {
        const albumScore = scoreMusicTitleMatch(entry.title, candidate.album);
        const titleScore = scoreMusicTitleMatch(trackTitle, candidate.title);
        const trackNumberMatches = validSequenceNumber !== null && candidate.trackNumber === validSequenceNumber;
        return { candidate, albumScore, titleScore, trackNumberMatches, score: (albumScore * 0.5) + (titleScore * 0.4) + (trackNumberMatches ? 0.1 : 0) };
      })
      .filter((candidate) => (mappedCandidates.length
        ? candidate.titleScore >= 0.75 || candidate.trackNumberMatches && candidate.titleScore >= 0.55
        : candidate.albumScore >= 0.55 && (candidate.titleScore >= 0.75 || candidate.trackNumberMatches && candidate.titleScore >= 0.55)))
      .sort((left, right) => right.score - left.score || Number(right.trackNumberMatches) - Number(left.trackNumberMatches) || right.titleScore - left.titleScore);
    const libraryTrack = rankedCandidates[0]?.candidate ?? null;
    if (!libraryTrack) {
      const trackCount = await prisma.musicLibraryTrack.count({ where: { libraryId: library.id } });
      res.json({ status: trackCount ? 'notFound' : 'unindexed', match: null });
      return;
    }
    const match = await prisma.personalTrackMatch.upsert({
      where: { cdEntryId_trackKey: { cdEntryId, trackKey } },
      create: { cdEntryId, trackKey, libraryTrackId: libraryTrack.id },
      update: { libraryTrackId: libraryTrack.id, matchedAt: new Date() },
      include: { libraryTrack: true },
    });
    res.json({ status: 'matched', match, matchType: rankedCandidates[0].albumScore === 1 && rankedCandidates[0].titleScore === 1 ? 'exact' : 'close' });
  });

  router.get('/api/music-library/albums/find', async (req, res) => {
    const cdEntryId = Number(req.query.cdEntryId);
    if (!Number.isInteger(cdEntryId) || cdEntryId <= 0) {
      res.status(400).json({ error: 'A valid catalog entry is required.' });
      return;
    }
    const [library, entry] = await Promise.all([getMusicLibrary(), prisma.cdEntry.findUnique({ where: { id: cdEntryId } })]);
    if (!library || !entry) {
      res.status(404).json({ error: library ? 'Catalog entry not found.' : 'Choose and scan a music library folder first.' });
      return;
    }
    const artistCandidates = await findArtistLibraryTracks(library.id, entry.artist);
    const groupedFolders = new Map<string, { album: string; trackCount: number; score: number }>();
    for (const candidate of artistCandidates) {
      const albumScore = scoreMusicTitleMatch(entry.title, candidate.album);
      const artistScore = scoreMusicTextMatch(entry.artist, candidate.artist);
      const score = (albumScore * 0.65) + (artistScore * 0.35);
      if (albumScore < 0.55 || artistScore < 0.7) continue;
      const folderPath = path.dirname(candidate.filePath);
      const current = groupedFolders.get(folderPath);
      groupedFolders.set(folderPath, {
        album: candidate.album,
        trackCount: (current?.trackCount ?? 0) + 1,
        score: Math.max(current?.score ?? 0, score),
      });
    }
    const albums = [...groupedFolders.entries()]
      .map(([folderPath, details]) => ({ folderPath, album: details.album, trackCount: details.trackCount, matchType: details.score >= 0.99 ? 'exact' : 'close', score: details.score }))
      .sort((left, right) => right.score - left.score || right.trackCount - left.trackCount || left.album.localeCompare(right.album));
    const trackCount = await prisma.musicLibraryTrack.count({ where: { libraryId: library.id } });
    res.json({ status: albums.length ? 'found' : (trackCount ? 'notFound' : 'unindexed'), albums, mappedFolderPath: entry.personalAlbumFolderPath });
  });

  router.patch('/api/cds/:id/personal-album-folder', async (req, res) => {
    const entryId = Number(req.params.id);
    const folderPath = typeof req.body?.folderPath === 'string' ? req.body.folderPath.trim() : null;
    if (!Number.isInteger(entryId) || entryId <= 0 || (req.body?.folderPath != null && !folderPath)) {
      res.status(400).json({ error: 'Provide a valid album folder path, or null to clear the mapping.' });
      return;
    }
    const library = await getMusicLibrary();
    if (!library) {
      res.status(404).json({ error: 'Choose and scan a music library folder first.' });
      return;
    }
    let resolvedFolderPath: string | null = null;
    if (folderPath) {
      resolvedFolderPath = path.resolve(folderPath);
      if (!pathIsWithinRoot(library.rootPath, resolvedFolderPath) || !await isDirectory(resolvedFolderPath)) {
        res.status(400).json({ error: 'Choose an existing album folder inside the configured music library.' });
        return;
      }
      const indexedTracks = await prisma.musicLibraryTrack.count({ where: { libraryId: library.id, filePath: { startsWith: `${resolvedFolderPath}${path.sep}` } } });
      if (!indexedTracks) {
        res.status(400).json({ error: 'That folder has no indexed audio tracks. Scan the music library first.' });
        return;
      }
    }
    try {
      const entry = await prisma.cdEntry.update({ where: { id: entryId }, data: { personalAlbumFolderPath: resolvedFolderPath, personalAlbumFolderMappedAt: resolvedFolderPath ? new Date() : null } });
      res.json(entry);
    } catch {
      res.status(404).json({ error: 'Catalog entry not found.' });
    }
  });

  router.post('/api/cds/:id/personal-album-folder/validate', async (req, res) => {
    const entryId = Number(req.params.id);
    const folderPath = typeof req.body?.folderPath === 'string' ? req.body.folderPath.trim() : '';
    if (!Number.isInteger(entryId) || entryId <= 0 || !folderPath) {
      res.status(400).json({ error: 'Choose an album folder to validate.' });
      return;
    }
    const [library, entry] = await Promise.all([getMusicLibrary(), prisma.cdEntry.findUnique({ where: { id: entryId } })]);
    if (!library || !entry?.discogsId || !discogsToken) {
      res.status(400).json({ error: 'A scanned music library and Discogs release are required for validation.' });
      return;
    }
    const resolvedFolderPath = path.resolve(folderPath);
    if (!pathIsWithinRoot(library.rootPath, resolvedFolderPath)) {
      res.status(400).json({ error: 'Choose an album folder inside the configured music library.' });
      return;
    }
    const indexedTracks = await prisma.musicLibraryTrack.findMany({ where: { libraryId: library.id, filePath: { startsWith: `${resolvedFolderPath}${path.sep}` } }, select: { id: true, title: true } });
    try {
      const releaseTracks = (await getDiscogsReleaseTracklist(entry.discogsId, discogsToken)).filter((track) => !track.isComposite);
      const remaining = [...indexedTracks];
      const matched = releaseTracks.every((releaseTrack) => {
        const bestIndex = remaining.reduce((best, candidate, index) => scoreMusicTitleMatch(releaseTrack.title, candidate.title) >= 0.75 && (best < 0 || scoreMusicTitleMatch(releaseTrack.title, candidate.title) > scoreMusicTitleMatch(releaseTrack.title, remaining[best].title)) ? index : best, -1);
        if (bestIndex < 0) return false;
        remaining.splice(bestIndex, 1);
        return true;
      });
      res.json({ valid: matched && releaseTracks.length === indexedTracks.length, releaseTrackCount: releaseTracks.length, folderTrackCount: indexedTracks.length });
    } catch (error) {
      console.error('Personal album folder validation failed:', error);
      res.status(502).json({ error: 'Unable to validate this album folder against Discogs right now.' });
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

  router.post('/api/music-library/catalog-personal-locations/scan', async (_req, res) => {
    const library = await getMusicLibrary();
    if (!library) {
      res.status(400).json({ error: 'Choose and scan a music library folder first.' });
      return;
    }
    if (libraryScanState.status === 'scanning') {
      res.status(409).json({ error: 'Wait for the music-library scan to finish before matching catalog albums.' });
      return;
    }
    if (catalogPersonalLocationScanState.status === 'scanning') {
      res.status(409).json({ error: 'A catalog local-copy scan is already running.' });
      return;
    }
    if (!await prisma.musicLibraryTrack.count({ where: { libraryId: library.id } })) {
      res.status(400).json({ error: 'Scan the music library before matching catalog albums.' });
      return;
    }
    void scanCatalogPersonalLocations(library.id);
    res.status(202).json({ scan: catalogPersonalLocationScanState });
  });

  router.post('/api/cds/:id/personal-track-matches/sync', async (req, res) => {
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

    const [library, entry] = await Promise.all([getMusicLibrary(), prisma.cdEntry.findUnique({ where: { id: cdEntryId } })]);
    if (!library || !entry) {
      res.status(404).json({ error: library ? 'Catalog entry not found.' : 'Choose and scan a music library folder first.' });
      return;
    }
    const mappedFolderPath = entry.personalAlbumFolderPath ? path.resolve(entry.personalAlbumFolderPath) : null;
    const mappedCandidates = mappedFolderPath
      ? await prisma.musicLibraryTrack.findMany({ where: { libraryId: library.id, filePath: { startsWith: `${mappedFolderPath}${path.sep}` } }, orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }] })
      : [];
    const candidates = mappedCandidates.length ? mappedCandidates : await findArtistLibraryTracks(library.id, entry.artist);
    const existingMatches = await prisma.personalTrackMatch.findMany({ where: { cdEntryId }, include: { libraryTrack: true } });
    const indexedTrackCount = candidates.length || await prisma.musicLibraryTrack.count({ where: { libraryId: library.id } });
    if (!candidates.length) {
      res.json({ status: indexedTrackCount ? 'notFound' : 'unindexed', matchedCount: 0, unmatchedCount: tracks.length, matches: existingMatches });
      return;
    }

    const previousMatchByKey = new Map(existingMatches.map((match) => [match.trackKey, match.libraryTrackId]));
    const usedLibraryTrackIds = new Set<number>();
    const physicalKeyByTrackKey = physicalTrackKeys(tracks);
    const libraryTrackByPhysicalKey = new Map<string, number>();
    const savedMatches = [];
    for (const track of tracks) {
      const physicalKey = physicalKeyByTrackKey.get(track.trackKey) ?? `track:${track.trackKey}`;
      const sharedLibraryTrackId = libraryTrackByPhysicalKey.get(physicalKey);
      const rankedCandidates = candidates
        .map((candidate) => {
          const albumScore = scoreMusicTitleMatch(entry.title, candidate.album);
          const titleScore = scoreMusicTitleMatch(track.title, candidate.title);
          const trackNumberMatches = track.sequenceNumber !== undefined && candidate.trackNumber === track.sequenceNumber;
          return { candidate, albumScore, titleScore, trackNumberMatches, score: (albumScore * 0.5) + (titleScore * 0.4) + (trackNumberMatches ? 0.1 : 0) };
        })
        .filter((candidate) => (mappedCandidates.length
          ? candidate.titleScore >= 0.75 || candidate.trackNumberMatches && candidate.titleScore >= 0.55
          : candidate.albumScore >= 0.55 && (candidate.titleScore >= 0.75 || candidate.trackNumberMatches && candidate.titleScore >= 0.55)))
        .filter((candidate) => !usedLibraryTrackIds.has(candidate.candidate.id)
          || previousMatchByKey.get(track.trackKey) === candidate.candidate.id
          || sharedLibraryTrackId === candidate.candidate.id)
        .sort((left, right) => right.score - left.score || Number(right.trackNumberMatches) - Number(left.trackNumberMatches) || right.titleScore - left.titleScore);
      const libraryTrack = rankedCandidates.find(({ candidate }) => candidate.id === sharedLibraryTrackId)?.candidate ?? rankedCandidates[0]?.candidate;
      if (!libraryTrack) continue;
      usedLibraryTrackIds.add(libraryTrack.id);
      libraryTrackByPhysicalKey.set(physicalKey, libraryTrack.id);
      savedMatches.push(await prisma.personalTrackMatch.upsert({
        where: { cdEntryId_trackKey: { cdEntryId, trackKey: track.trackKey } },
        create: { cdEntryId, trackKey: track.trackKey, libraryTrackId: libraryTrack.id },
        update: { libraryTrackId: libraryTrack.id, matchedAt: new Date() },
        include: { libraryTrack: true },
      }));
    }
    const matches = await prisma.personalTrackMatch.findMany({ where: { cdEntryId }, include: { libraryTrack: true } });
    res.json({ status: savedMatches.length ? 'matched' : 'notFound', matchedCount: savedMatches.length, unmatchedCount: tracks.length - savedMatches.length, matches });
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
