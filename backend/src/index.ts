import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { createReadStream, promises as fs } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { cleanDiscogsText, getDiscogsPriceSuggestions, getDiscogsReleaseCatalogInfo, getDiscogsReleaseContext, getDiscogsReleaseCover, getDiscogsReleaseImages, getDiscogsReleaseTracklist, searchDiscogsReleases, stripDiscogsArtistDisambiguator } from './discogs.js';
import { getMusicBrainzCatalogContext, searchMusicBrainz } from './musicbrainz.js';
import { getEbayActiveListingStats, getEbaySoldListingStats } from './ebay.js';
import { findYouTubeMatches } from './youtube.js';
import { artistSearchFallbacks, contentTypeForAudioFile, isDirectory, normalizeMusicText, pathIsWithinRoot, readMusicFileMetadata, scoreMusicTextMatch, scoreMusicTitleMatch, walkAudioFiles } from './music-library.js';
import { CatalogEnrichmentService } from './services/catalog-enrichment-service.js';
import { DiscogsCollectionSyncService } from './services/discogs-collection-sync-service.js';
import { fetchDiscogsMarketStats } from './discogs-market-stats.js';
import { getStageDiscogsCatalogInfo, getStageDiscogsContext, getStageDiscogsCover, getStageDiscogsImages, getStageDiscogsTracklist, searchStageDiscogsReleases } from './stage-discogs-fixture.js';
import { getStageMusicBrainzCatalogContext, searchStageMusicBrainz } from './stage-musicbrainz-fixture.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
if (process.env.APP_ENV === 'stage') {
  dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env.stage'), override: true });
  // Stage is deliberately isolated from external integrations and personal data.
  process.env.DISCOGS_TOKEN = '';
  process.env.EBAY_CLIENT_ID = '';
  process.env.EBAY_CLIENT_SECRET = '';
  process.env.YOUTUBE_API_KEY = '';
}
process.env.DATABASE_URL ??= 'file:./dev.db';
if (process.env.APP_ENV === 'stage') {
  console.log(`Stage mode enabled with database ${process.env.DATABASE_URL} on port ${process.env.PORT ?? '3101'}.`);
}

const app = express();
const prisma = new PrismaClient(process.env.APP_ENV === 'stage'
  ? { datasources: { db: { url: process.env.DATABASE_URL } } }
  : undefined);
const port = process.env.PORT ? Number(process.env.PORT) : 3100;
const host = process.env.HOST?.trim() || undefined;
const discogsToken = process.env.DISCOGS_TOKEN?.trim();
const ebayClientId = process.env.EBAY_CLIENT_ID?.trim();
const ebayClientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
const ebayMarketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || 'EBAY_US';
const youtubeApiKey = process.env.YOUTUBE_API_KEY?.trim();
const isStageEnvironment = process.env.APP_ENV === 'stage';
const catalogEnrichment = new CatalogEnrichmentService(prisma, discogsToken, isStageEnvironment);
const discogsCollectionSync = new DiscogsCollectionSyncService(prisma, discogsToken, isStageEnvironment);
const coverCache = new Map<number, string | null>();
const pendingCoverLookups = new Map<number, Promise<string | null>>();
const libraryScanState: { status: 'idle' | 'scanning' | 'complete' | 'failed'; scannedFiles: number; indexedFiles: number; skippedFiles: number; error: string | null } = {
  status: 'idle', scannedFiles: 0, indexedFiles: 0, skippedFiles: 0, error: null,
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

function catalogArtistSortName(artist: string): string {
  return artist.replace(/^the\s+/iu, '').trim() || artist;
}

async function normalizeStoredCatalogText() {
  const entries = await prisma.cdEntry.findMany({ select: { id: true, artist: true, artistSortName: true, title: true, label: true } });
  const updates = entries
    .map((entry) => ({
      id: entry.id,
      artist: stripDiscogsArtistDisambiguator(entry.artist),
      artistSortName: catalogArtistSortName(stripDiscogsArtistDisambiguator(entry.artist)),
      title: cleanDiscogsText(entry.title) || entry.title,
      label: entry.label ? cleanDiscogsText(entry.label) || null : null,
    }))
    .filter((entry, index) => entry.artist !== entries[index].artist || entry.artistSortName !== entries[index].artistSortName || entry.title !== entries[index].title || entry.label !== entries[index].label);

  if (updates.length) {
    await prisma.$transaction(updates.map((entry) => prisma.cdEntry.update({ where: { id: entry.id }, data: { artist: entry.artist, artistSortName: entry.artistSortName, title: entry.title, label: entry.label } })));
    console.log(`Normalized non-language Discogs text on ${updates.length} catalog entr${updates.length === 1 ? 'y' : 'ies'}.`);
  }
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

async function scanMusicLibrary(libraryId: number, rootPath: string) {
  const scanStartedAt = new Date();
  libraryScanState.status = 'scanning';
  libraryScanState.scannedFiles = 0;
  libraryScanState.indexedFiles = 0;
  libraryScanState.skippedFiles = 0;
  libraryScanState.error = null;
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
    libraryScanState.status = 'complete';
  } catch (error) {
    libraryScanState.status = 'failed';
    libraryScanState.error = error instanceof Error ? error.message : 'Unable to scan the music library.';
  }
}

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/music-library', async (_req, res) => {
  const library = await getMusicLibrary();
  const trackCount = library ? await prisma.musicLibraryTrack.count({ where: { libraryId: library.id } }) : 0;
  res.json({
    rootPath: library?.rootPath ?? null,
    lastScannedAt: library?.lastScannedAt ?? null,
    trackCount,
    scan: libraryScanState,
  });
});

app.put('/api/music-library', async (req, res) => {
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
  res.json({ rootPath: library.rootPath, lastScannedAt: library.lastScannedAt });
});

app.post('/api/music-library/scan', async (_req, res) => {
  const library = await getMusicLibrary();
  if (!library) {
    res.status(400).json({ error: 'Choose a music library folder first.' });
    return;
  }
  if (libraryScanState.status === 'scanning') {
    res.status(409).json({ error: 'A music-library scan is already running.' });
    return;
  }
  if (!await isDirectory(library.rootPath)) {
    res.status(400).json({ error: 'The configured music library folder is currently unavailable.' });
    return;
  }
  void scanMusicLibrary(library.id, library.rootPath);
  res.status(202).json({ scan: libraryScanState });
});

app.get('/api/music-library/folders/artists', async (_req, res) => {
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

app.get('/api/music-library/folders/albums', async (req, res) => {
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

app.get('/api/music-library/matches/find', async (req, res) => {
  const cdEntryId = Number(req.query.cdEntryId);
  const trackKey = String(req.query.trackKey || '').trim();
  const trackTitle = String(req.query.trackTitle || '').trim();
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
      return { candidate, albumScore, titleScore, score: (albumScore * 0.6) + (titleScore * 0.4) };
    })
    .filter((candidate) => (mappedCandidates.length ? candidate.titleScore >= 0.75 : candidate.albumScore >= 0.55 && candidate.titleScore >= 0.75))
    .sort((left, right) => right.score - left.score || right.albumScore - left.albumScore || right.titleScore - left.titleScore);
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

app.get('/api/music-library/albums/find', async (req, res) => {
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

app.patch('/api/cds/:id/personal-album-folder', async (req, res) => {
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

app.post('/api/cds/:id/personal-album-folder/validate', async (req, res) => {
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
    const releaseTracks = await getDiscogsReleaseTracklist(entry.discogsId, discogsToken);
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

app.get('/api/cds/:id/personal-track-matches', async (req, res) => {
  const cdEntryId = Number(req.params.id);
  if (!Number.isInteger(cdEntryId) || cdEntryId <= 0) {
    res.status(400).json({ error: 'A valid catalog entry ID is required.' });
    return;
  }
  res.json({ matches: await prisma.personalTrackMatch.findMany({ where: { cdEntryId }, include: { libraryTrack: true } }) });
});

app.get('/api/music-library/playback/next', async (req, res) => {
  const cdEntryId = Number(req.query.cdEntryId);
  const trackId = Number(req.query.trackId);
  if (!Number.isInteger(cdEntryId) || cdEntryId <= 0 || !Number.isInteger(trackId) || trackId <= 0) {
    res.status(400).json({ error: 'The current catalog entry and local track are required.' });
    return;
  }

  const toPlaybackTrack = (match: { libraryTrack: { id: number; title: string; artist: string; album: string } }, entryId: number) => ({
    trackId: match.libraryTrack.id,
    catalogEntryId: entryId,
    title: match.libraryTrack.title,
    subtitle: `${match.libraryTrack.artist} — ${match.libraryTrack.album}`,
  });
  const currentAlbumMatches = await prisma.personalTrackMatch.findMany({
    where: { cdEntryId },
    include: { libraryTrack: true },
    orderBy: [{ libraryTrack: { discNumber: 'asc' } }, { libraryTrack: { trackNumber: 'asc' } }, { libraryTrack: { title: 'asc' } }],
  });
  const currentIndex = currentAlbumMatches.findIndex((match) => match.libraryTrackId === trackId);
  const nextOnCurrentAlbum = currentIndex >= 0 ? currentAlbumMatches[currentIndex + 1] : null;
  if (nextOnCurrentAlbum) {
    res.json({ next: toPlaybackTrack(nextOnCurrentAlbum, cdEntryId) });
    return;
  }

  const playableEntries = await prisma.cdEntry.findMany({
    where: { personalTrackMatches: { some: {} } },
    select: { id: true },
    orderBy: [{ artistSortName: 'asc' }, { artist: 'asc' }, { title: 'asc' }],
  });
  const currentEntryIndex = playableEntries.findIndex((entry) => entry.id === cdEntryId);
  for (const entry of playableEntries.slice(currentEntryIndex + 1)) {
    const firstMatch = await prisma.personalTrackMatch.findFirst({
      where: { cdEntryId: entry.id },
      include: { libraryTrack: true },
      orderBy: [{ libraryTrack: { discNumber: 'asc' } }, { libraryTrack: { trackNumber: 'asc' } }, { libraryTrack: { title: 'asc' } }],
    });
    if (firstMatch) {
      res.json({ next: toPlaybackTrack(firstMatch, entry.id) });
      return;
    }
  }
  res.json({ next: null });
});

app.get('/api/music-library/tracks/:id/stream', async (req, res) => {
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

app.get('/api/music-library/playback-diagnostics', (_req, res) => {
  res.json({ requests: playbackDiagnostics });
});

app.get('/api/discogs/collection-sync', async (_req, res) => {
  res.json({ ...(await discogsCollectionSync.getPreview()), sync: discogsCollectionSync.state });
});

app.post('/api/discogs/collection-sync', async (_req, res) => {
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

app.get('/api/cds', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const sort = String(req.query.sort || 'artist');
  const requestedPage = Number(req.query.page || 1);
  const requestedPageSize = Number(req.query.pageSize || 24);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = Number.isInteger(requestedPageSize) ? Math.min(Math.max(requestedPageSize, 12), 100) : 24;
  const where = query ? {
    OR: [
      { artist: { contains: query } },
      { title: { contains: query } },
      { catalogNumber: { contains: query } },
      { barcode: { contains: query } },
    ],
  } : undefined;
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
    items: items.map(({ coverImageData, coverImageMimeType, ...item }) => ({ ...item, hasCover: Boolean(coverImageData && coverImageMimeType) })),
    total, page, pageSize,
  });
});

app.get('/api/catalog/statistics', async (_req, res) => {
  const [totalEntries, medianValues, estimatedValues] = await Promise.all([
    prisma.cdEntry.count(),
    prisma.cdEntry.aggregate({ where: { discogsMarketMedian: { not: null } }, _count: { discogsMarketMedian: true }, _sum: { discogsMarketMedian: true } }),
    prisma.cdEntry.aggregate({ where: { estimatedValue: { not: null } }, _count: { estimatedValue: true }, _sum: { estimatedValue: true } }),
  ]);
  res.json({
    totalEntries,
    discogsMedian: { count: medianValues._count.discogsMarketMedian, total: medianValues._sum.discogsMarketMedian ?? 0 },
    estimatedValue: { count: estimatedValues._count.estimatedValue, total: estimatedValues._sum.estimatedValue ?? 0 },
  });
});

app.get('/api/catalog-cover-backfill', (_req, res) => {
  res.json(catalogEnrichment.coverBackfill);
});

app.post('/api/catalog-cover-backfill', async (_req, res) => {
  if (catalogEnrichment.coverBackfill.status === 'running') {
    res.status(409).json({ error: 'Cover-art backfill is already running.' });
    return;
  }
  if (!catalogEnrichment.hasDiscogsAccess) {
    res.status(503).json({ error: 'Discogs authentication is not configured.' });
    return;
  }
  void catalogEnrichment.startCoverBackfill();
  res.status(202).json(catalogEnrichment.coverBackfill);
});

app.get('/api/catalog-release-info-backfill', (_req, res) => {
  res.json(catalogEnrichment.releaseInfoBackfill);
});

app.post('/api/catalog-release-info-backfill', async (_req, res) => {
  if (catalogEnrichment.releaseInfoBackfill.status === 'running') {
    res.status(409).json({ error: 'Release-label backfill is already running.' });
    return;
  }
  if (!catalogEnrichment.hasDiscogsAccess) {
    res.status(503).json({ error: 'Discogs authentication is not configured.' });
    return;
  }
  void catalogEnrichment.startReleaseInfoBackfill();
  res.status(202).json(catalogEnrichment.releaseInfoBackfill);
});

app.get('/api/catalog-discogs-context-backfill', (_req, res) => {
  res.json(catalogEnrichment.contextBackfill);
});

app.post('/api/catalog-discogs-context-backfill', async (_req, res) => {
  if (catalogEnrichment.contextBackfill.status === 'running') {
    res.status(409).json({ error: 'Discogs-context backfill is already running.' });
    return;
  }
  if (!catalogEnrichment.hasDiscogsAccess) {
    res.status(503).json({ error: 'Discogs authentication is not configured.' });
    return;
  }
  void catalogEnrichment.startContextBackfill();
  res.status(202).json(catalogEnrichment.contextBackfill);
});

app.get('/api/catalog-genre-style-backfill', (_req, res) => {
  res.json(catalogEnrichment.genreStyleBackfill);
});

app.post('/api/catalog-genre-style-backfill', async (_req, res) => {
  if (catalogEnrichment.genreStyleBackfill.status === 'running') {
    res.status(409).json({ error: 'Genre/style backfill is already running.' });
    return;
  }
  if (!catalogEnrichment.hasDiscogsAccess) {
    res.status(503).json({ error: 'Discogs authentication is not configured.' });
    return;
  }
  void catalogEnrichment.startGenreStyleBackfill();
  res.status(202).json(catalogEnrichment.genreStyleBackfill);
});

app.get('/api/catalog-discogs-market-stats-backfill', (_req, res) => {
  res.json(catalogEnrichment.marketStatsBackfill);
});

app.post('/api/catalog-discogs-market-stats-backfill', async (_req, res) => {
  if (catalogEnrichment.marketStatsBackfill.status === 'running') {
    res.status(409).json({ error: 'Discogs market-statistics backfill is already running.' });
    return;
  }
  if (isStageEnvironment) {
    res.status(503).json({ error: 'Live Discogs page scraping is disabled in Stage.' });
    return;
  }
  void catalogEnrichment.startMarketStatsBackfill();
  res.status(202).json(catalogEnrichment.marketStatsBackfill);
});

app.get('/api/cds/:id/cover', async (req, res) => {
  const entryId = Number(req.params.id);
  const entry = Number.isInteger(entryId) && entryId > 0
    ? await prisma.cdEntry.findUnique({ where: { id: entryId }, select: { coverImageData: true, coverImageMimeType: true } })
    : null;
  if (!entry?.coverImageData || !entry.coverImageMimeType) {
    res.status(404).end();
    return;
  }
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.type(entry.coverImageMimeType).send(entry.coverImageData);
});

app.patch('/api/cds/:id/estimated-value', async (req, res) => {
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

app.patch('/api/cds/:id/details', async (req, res) => {
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

app.get('/api/discogs/search', async (req, res) => {
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

app.get('/api/musicbrainz/search', async (req, res) => {
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

app.get('/api/musicbrainz/context', async (req, res) => {
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

app.get('/api/discogs/releases/:id/cover', async (req, res) => {
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

  if (coverCache.has(releaseId)) {
    res.json({ coverImage: coverCache.get(releaseId) });
    return;
  }

  let lookup = pendingCoverLookups.get(releaseId);
  if (!lookup) {
    lookup = getDiscogsReleaseCover(releaseId, discogsToken)
      .then((coverImage) => {
        coverCache.set(releaseId, coverImage);
        return coverImage;
      })
      .finally(() => pendingCoverLookups.delete(releaseId));
    pendingCoverLookups.set(releaseId, lookup);
  }

  try {
    res.json({ coverImage: await lookup });
  } catch (error) {
    console.error('Discogs cover lookup failed:', error);
    res.status(502).json({ error: 'Unable to load cover art right now.' });
  }
});

app.get('/api/discogs/releases/:id/images', async (req, res) => {
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

app.get('/api/discogs/releases/:id/tracklist', async (req, res) => {
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

app.get('/api/discogs/releases/:id/price-suggestions', async (req, res) => {
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

app.get('/api/discogs/releases/:id/catalog-info', async (req, res) => {
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

app.get('/api/discogs/releases/:id/market-stats', async (req, res) => {
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

app.get('/api/discogs/releases/:id/context', async (req, res) => {
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

app.get('/api/ebay/active-listing-stats', async (req, res) => {
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

app.get('/api/ebay/sold-listing-stats', async (req, res) => {
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

app.get('/api/youtube/best-match', async (req, res) => {
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

app.get('/api/cds/:id/youtube-track-matches', async (req, res) => {
  const entryId = Number(req.params.id);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    res.status(400).json({ error: 'A valid catalog entry ID is required.' });
    return;
  }
  res.json({ matches: await prisma.youTubeTrackMatch.findMany({ where: { cdEntryId: entryId } }) });
});

app.put('/api/cds/:id/youtube-track-matches', async (req, res) => {
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

app.post('/api/cds', async (req, res) => {
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

  if (discogsId) {
    const existingDiscogsEntry = await prisma.cdEntry.findFirst({ where: { discogsId } });
    if (existingDiscogsEntry) {
      res.status(409).json({ error: 'This exact Discogs release is already in your catalog.' });
      return;
    }
  }

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

app.patch('/api/cds/:id', async (req, res) => {
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

  const existingDiscogsEntry = await prisma.cdEntry.findFirst({
    where: { discogsId, NOT: { id: entryId } },
  });
  if (existingDiscogsEntry) {
    res.status(409).json({ error: 'This exact Discogs release is already in your catalog.' });
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

  const updated = await prisma.cdEntry.update({
    where: { id: entryId },
    data: {
      title, artist: normalizedArtist, artistSortName: catalogArtistSortName(normalizedArtist), year: year ?? null, country: country ?? null, label: releaseLabel, format: format ?? null,
      discogsId, discogsUri: discogsUri ?? null, catalogNumber: releaseCatalogNumber, barcode: releaseBarcode, mediaCondition: normalizedMediaCondition,
      estimatedValue, valueLastCheckedAt, notes: notes ?? null,
      estimatedValueIsManual: hasManualEstimatedValue,
      estimatedValueReviewedAt: hasManualEstimatedValue ? new Date() : null,
      ...(existing.discogsId !== discogsId ? {
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

app.delete('/api/cds/:id', async (req, res) => {
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

void normalizeStoredCatalogText()
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
