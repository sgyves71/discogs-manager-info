import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { isDirectory, normalizeMusicText, readMusicFileMetadata, scoreMusicTextMatch, scoreMusicTitleMatch, walkAudioFiles } from '../music-library.js';

type ScanRequest<T> = { kind: 'accepted'; scan: T }
  | { kind: 'conflict' | 'invalid'; error: string };

export class MusicLibraryScanService {
  private readonly libraryScanState: { status: 'idle' | 'scanning' | 'complete' | 'failed'; scannedFiles: number; indexedFiles: number; skippedFiles: number; error: string | null } = {
    status: 'idle', scannedFiles: 0, indexedFiles: 0, skippedFiles: 0, error: null,
  };
  private readonly catalogPersonalLocationScanState: { status: 'idle' | 'scanning' | 'complete' | 'failed'; total: number; processed: number; matched: number; alreadyMapped: number; unmatched: number; error: string | null } = {
    status: 'idle', total: 0, processed: 0, matched: 0, alreadyMapped: 0, unmatched: 0, error: null,
  };

  private activeOperation: 'library' | 'catalog' | 'folder' | undefined;

  constructor(
    private readonly prisma: Pick<PrismaClient, 'cdEntry' | 'musicLibrary' | 'musicLibraryTrack' | '$executeRaw' | '$transaction'>,
    private readonly directoryExists = isDirectory,
  ) {}

  get libraryScan() {
    return { ...this.libraryScanState };
  }

  get catalogLocationScan() {
    return { ...this.catalogPersonalLocationScanState };
  }

  async changeFolder(rootPath: string) {
    if (this.activeOperation) {
      const error = this.activeOperation === 'folder'
        ? 'A music-library folder change is already in progress.'
        : 'Wait for the active scan to finish before changing the music library folder.';
      return { kind: 'conflict' as const, error };
    }

    this.activeOperation = 'folder';
    try {
      if (!await this.directoryExists(rootPath)) {
        return { kind: 'invalid' as const, error: 'That music library folder is not available on this PC.' };
      }
      const library = await this.prisma.$transaction(async (db) => {
        const existing = await db.musicLibrary.findFirst({ orderBy: { id: 'asc' } });
        if (!existing) return db.musicLibrary.create({ data: { rootPath } });
        const updated = await db.musicLibrary.update({
          where: { id: existing.id }, data: { rootPath, lastScannedAt: null },
        });
        if (existing.rootPath !== rootPath) {
          await db.musicLibraryTrack.deleteMany({ where: { libraryId: existing.id } });
        }
        return updated;
      });
      this.resetAfterFolderChange();
      return { kind: 'updated' as const, rootPath: library.rootPath, lastScannedAt: library.lastScannedAt };
    } finally {
      this.activeOperation = undefined;
    }
  }

  private resetAfterFolderChange() {
    Object.assign(this.libraryScanState, {
      status: 'idle', scannedFiles: 0, indexedFiles: 0, skippedFiles: 0, error: null,
    });
    this.catalogPersonalLocationScanState.status = 'idle';
  }

  async startLibraryScan(): Promise<ScanRequest<typeof this.libraryScan>> {
    return this.startScan<typeof this.libraryScan>('library', async () => {
      const library = await this.prisma.musicLibrary.findFirst({ orderBy: { id: 'asc' } });
      if (!library) return { error: 'Choose a music library folder first.' };
      if (!await this.directoryExists(library.rootPath)) {
        return { error: 'The configured music library folder is currently unavailable.' };
      }
      const completion = this.scanMusicLibrary(library.id, library.rootPath);
      return { completion, scan: this.libraryScan };
    });
  }

  async startCatalogLocationScan(): Promise<ScanRequest<typeof this.catalogLocationScan>> {
    return this.startScan<typeof this.catalogLocationScan>('catalog', async () => {
      const library = await this.prisma.musicLibrary.findFirst({ orderBy: { id: 'asc' } });
      if (!library) return { error: 'Choose and scan a music library folder first.' };
      if (!await this.prisma.musicLibraryTrack.count({ where: { libraryId: library.id } })) {
        return { error: 'Scan the music library before matching catalog albums.' };
      }
      const completion = this.scanCatalogPersonalLocations(library.id);
      return { completion, scan: this.catalogLocationScan };
    });
  }

  private async startScan<T>(
    kind: 'library' | 'catalog',
    prepare: () => Promise<{ error: string } | { completion: Promise<void>; scan: T }>,
  ): Promise<ScanRequest<T>> {
    const activeScan = this.activeOperation;
    if (activeScan === 'folder') {
      return { kind: 'conflict', error: 'Wait for the music-library folder change to finish before starting a scan.' };
    }
    if (activeScan) {
      const messages = {
        library: {
          library: 'A music-library scan is already running.',
          catalog: 'Wait for catalog local-copy matching to finish before rescanning the music library.',
        },
        catalog: {
          library: 'Wait for the music-library scan to finish before matching catalog albums.',
          catalog: 'A catalog local-copy scan is already running.',
        },
      };
      return { kind: 'conflict', error: messages[kind][activeScan] };
    }

    this.activeOperation = kind;
    let releaseAfterPreparation = true;
    try {
      const result = await prepare();
      if ('error' in result) return { kind: 'invalid', error: result.error };
      releaseAfterPreparation = false;
      void result.completion.finally(() => { this.activeOperation = undefined; });
      return { kind: 'accepted', scan: result.scan };
    } finally {
      if (releaseAfterPreparation) this.activeOperation = undefined;
    }
  }

  private async scanCatalogPersonalLocations(libraryId: number) {
    this.catalogPersonalLocationScanState.status = 'scanning';
    this.catalogPersonalLocationScanState.processed = 0;
    this.catalogPersonalLocationScanState.matched = 0;
    this.catalogPersonalLocationScanState.alreadyMapped = 0;
    this.catalogPersonalLocationScanState.unmatched = 0;
    this.catalogPersonalLocationScanState.error = null;
    try {
      const [entries, libraryTracks] = await Promise.all([
        this.prisma.cdEntry.findMany({ select: { id: true, artist: true, title: true, personalAlbumFolderPath: true }, orderBy: { id: 'asc' } }),
        this.prisma.musicLibraryTrack.findMany({ where: { libraryId }, select: { filePath: true, artist: true, album: true, normalizedArtist: true, trackNumber: true } }),
      ]);
      this.catalogPersonalLocationScanState.total = entries.length;
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
          this.catalogPersonalLocationScanState.alreadyMapped += 1;
        } else {
          const normalizedArtist = normalizeMusicText(entry.artist);
          const artistCandidates = tracksByArtist.get(normalizedArtist)
            ?? libraryTracks.filter((track) => scoreMusicTextMatch(entry.artist, track.artist) >= 0.7);
          const albumMatch = artistCandidates
            .map((track) => ({ track, albumScore: scoreMusicTitleMatch(entry.title, track.album) }))
            .filter(({ albumScore }) => albumScore >= 0.55)
            .sort((left, right) => right.albumScore - left.albumScore || (left.track.trackNumber ?? 0) - (right.track.trackNumber ?? 0))[0]?.track;
          if (albumMatch) {
            await this.prisma.cdEntry.update({
              where: { id: entry.id },
              data: { personalAlbumFolderPath: path.dirname(albumMatch.filePath), personalAlbumFolderMappedAt: new Date() },
            });
            this.catalogPersonalLocationScanState.matched += 1;
          } else {
            this.catalogPersonalLocationScanState.unmatched += 1;
          }
        }
        this.catalogPersonalLocationScanState.processed += 1;
        if (this.catalogPersonalLocationScanState.processed % 25 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
      }
      this.catalogPersonalLocationScanState.status = 'complete';
    } catch (error) {
      this.catalogPersonalLocationScanState.status = 'failed';
      this.catalogPersonalLocationScanState.error = error instanceof Error ? error.message : 'Unable to match the catalog to the music library.';
    }
  }

  private async scanMusicLibrary(libraryId: number, rootPath: string) {
    const scanStartedAt = new Date();
    this.libraryScanState.status = 'scanning';
    this.libraryScanState.scannedFiles = 0;
    this.libraryScanState.indexedFiles = 0;
    this.libraryScanState.skippedFiles = 0;
    this.libraryScanState.error = null;
    this.catalogPersonalLocationScanState.status = 'idle';
    this.catalogPersonalLocationScanState.total = 0;
    this.catalogPersonalLocationScanState.processed = 0;
    this.catalogPersonalLocationScanState.matched = 0;
    this.catalogPersonalLocationScanState.alreadyMapped = 0;
    this.catalogPersonalLocationScanState.unmatched = 0;
    this.catalogPersonalLocationScanState.error = null;
    try {
      await walkAudioFiles(rootPath, async (filePath) => {
        this.libraryScanState.scannedFiles += 1;
        try {
          const metadata = await readMusicFileMetadata(filePath);
          if (!metadata.artist || !metadata.album || !metadata.title) {
            this.libraryScanState.skippedFiles += 1;
            return;
          }
          await this.prisma.musicLibraryTrack.upsert({
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
          this.libraryScanState.indexedFiles += 1;
        } catch {
          this.libraryScanState.skippedFiles += 1;
        }
      });
      // SQLite defaults and older fixtures can store dates as text. Prisma writes epoch milliseconds.
      await this.prisma.$executeRaw`
        DELETE FROM "MusicLibraryTrack"
        WHERE "libraryId" = ${libraryId}
          AND CASE typeof("indexedAt")
            WHEN 'text' THEN round((julianday("indexedAt") - 2440587.5) * 86400000)
            ELSE "indexedAt"
          END < ${scanStartedAt.getTime()}
      `;
      await this.prisma.musicLibrary.update({ where: { id: libraryId }, data: { lastScannedAt: new Date() } });
      await this.scanCatalogPersonalLocations(libraryId);
      this.libraryScanState.status = 'complete';
    } catch (error) {
      this.libraryScanState.status = 'failed';
      this.libraryScanState.error = error instanceof Error ? error.message : 'Unable to scan the music library.';
    }
  }
}
