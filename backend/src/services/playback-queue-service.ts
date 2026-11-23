import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { artistSearchFallbacks, normalizeMusicText, scoreMusicTextMatch, scoreMusicTitleMatch } from '../music-library.js';

export type PlaybackDirection = 'next' | 'previous';
export type PlaybackTrack = { trackId: number; catalogEntryId: number; title: string; subtitle: string };

export function adjacentIndex(currentIndex: number, direction: PlaybackDirection): number {
  return direction === 'next' ? currentIndex + 1 : currentIndex - 1;
}

export class PlaybackQueueService {
  constructor(private readonly prisma: PrismaClient) {}

  async findAdjacent(catalogEntryId: number, trackId: number, direction: PlaybackDirection): Promise<PlaybackTrack | null> {
    const currentTrack = await this.prisma.musicLibraryTrack.findUnique({ where: { id: trackId } });
    if (!currentTrack) throw new Error('CURRENT_TRACK_NOT_FOUND');

    const albumTracks = await this.prisma.musicLibraryTrack.findMany({
      where: { libraryId: currentTrack.libraryId, normalizedArtist: currentTrack.normalizedArtist, normalizedAlbum: currentTrack.normalizedAlbum },
      orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }, { title: 'asc' }],
    });
    const currentIndex = albumTracks.findIndex((track) => track.id === trackId);
    const adjacentTrack = currentIndex >= 0 ? albumTracks[adjacentIndex(currentIndex, direction)] : null;
    if (adjacentTrack) return this.toPlaybackTrack(adjacentTrack, catalogEntryId);

    return this.findOnAdjacentCatalogAlbum(catalogEntryId, currentTrack.libraryId, direction);
  }

  private async findOnAdjacentCatalogAlbum(catalogEntryId: number, libraryId: number, direction: PlaybackDirection): Promise<PlaybackTrack | null> {
    const entries = await this.prisma.cdEntry.findMany({
      select: { id: true, artist: true, title: true, personalAlbumFolderPath: true },
      orderBy: [{ artistSortName: 'asc' }, { artist: 'asc' }, { title: 'asc' }],
    });
    const currentIndex = entries.findIndex((entry) => entry.id === catalogEntryId);
    const candidates = direction === 'next' ? entries.slice(currentIndex + 1) : entries.slice(0, currentIndex).reverse();
    for (const entry of candidates) {
      const anchor = await this.findAlbumAnchor(entry, libraryId);
      if (!anchor) continue;
      const track = await this.prisma.musicLibraryTrack.findFirst({
        where: { libraryId: anchor.libraryId, normalizedArtist: anchor.normalizedArtist, normalizedAlbum: anchor.normalizedAlbum },
        orderBy: direction === 'next'
          ? [{ discNumber: 'asc' }, { trackNumber: 'asc' }, { title: 'asc' }]
          : [{ discNumber: 'desc' }, { trackNumber: 'desc' }, { title: 'desc' }],
      });
      if (track) return this.toPlaybackTrack(track, entry.id);
    }
    return null;
  }

  private async findAlbumAnchor(entry: { artist: string; title: string; personalAlbumFolderPath: string | null }, libraryId: number) {
    const mappedFolder = entry.personalAlbumFolderPath ? path.resolve(entry.personalAlbumFolderPath) : null;
    const mappedTracks = mappedFolder
      ? await this.prisma.musicLibraryTrack.findMany({ where: { libraryId, filePath: { startsWith: `${mappedFolder}${path.sep}` } } })
      : [];
    const candidates = mappedTracks.length ? mappedTracks : await this.findArtistTracks(libraryId, entry.artist);
    return candidates
      .map((track) => ({ track, score: scoreMusicTitleMatch(entry.title, track.album) }))
      .filter(({ score }) => score >= 0.55)
      .sort((left, right) => right.score - left.score || (left.track.trackNumber ?? 0) - (right.track.trackNumber ?? 0))[0]?.track ?? null;
  }

  private async findArtistTracks(libraryId: number, artist: string) {
    const orderBy = [{ discNumber: 'asc' as const }, { trackNumber: 'asc' as const }];
    const exact = await this.prisma.musicLibraryTrack.findMany({ where: { libraryId, normalizedArtist: normalizeMusicText(artist) }, orderBy });
    if (exact.length) return exact;
    for (const shortenedArtist of artistSearchFallbacks(artist)) {
      const fallback = await this.prisma.musicLibraryTrack.findMany({ where: { libraryId, normalizedArtist: { startsWith: shortenedArtist } }, orderBy });
      if (fallback.length) return fallback;
    }
    const broad = await this.prisma.musicLibraryTrack.findMany({ where: { libraryId }, orderBy });
    return broad.filter((track) => scoreMusicTextMatch(artist, track.artist) >= 0.7);
  }

  private toPlaybackTrack(track: { id: number; title: string; artist: string; album: string }, catalogEntryId: number): PlaybackTrack {
    return { trackId: track.id, catalogEntryId, title: track.title, subtitle: `${track.artist} — ${track.album}` };
  }
}
