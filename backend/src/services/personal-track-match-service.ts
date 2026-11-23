import path from 'node:path';
import type { MusicLibraryTrack, PrismaClient } from '@prisma/client';
import { getDiscogsReleaseTracklist } from '../discogs.js';
import { artistSearchFallbacks, isDirectory, normalizeMusicText, pathIsWithinRoot, scoreMusicTextMatch, scoreMusicTitleMatch } from '../music-library.js';
import { physicalTrackKeys, type PersonalTrackDescriptor } from '../personal-track-matching.js';

export class PersonalTrackMatchService {
  constructor(private readonly prisma: Pick<PrismaClient, 'cdEntry' | 'musicLibrary' | 'musicLibraryTrack' | 'personalTrackMatch'>) {}

  private getMusicLibrary() {
    return this.prisma.musicLibrary.findFirst({ orderBy: { id: 'asc' } });
  }

  private async findArtistLibraryTracks(libraryId: number, artist: string) {
    const normalizedArtist = normalizeMusicText(artist);
    const exactMatches = await this.prisma.musicLibraryTrack.findMany({
      where: { libraryId, normalizedArtist },
      orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
    });
    if (exactMatches.length) return exactMatches;
    for (const shortenedArtist of artistSearchFallbacks(artist)) {
      const fallbackMatches = await this.prisma.musicLibraryTrack.findMany({
        where: { libraryId, normalizedArtist: { startsWith: shortenedArtist } },
        orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
      });
      if (fallbackMatches.length) return fallbackMatches;
    }
    const broadCandidates = await this.prisma.musicLibraryTrack.findMany({
      where: { libraryId },
      orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
    });
    return broadCandidates.filter((candidate) => scoreMusicTextMatch(artist, candidate.artist) >= 0.7);
  }

  private async trackCandidates(libraryId: number, artist: string, folderPath: string | null) {
    const mappedFolderPath = folderPath ? path.resolve(folderPath) : null;
    const mappedCandidates = mappedFolderPath
      ? await this.prisma.musicLibraryTrack.findMany({
        where: { libraryId: libraryId, filePath: { startsWith: `${mappedFolderPath}${path.sep}` } },
        orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
      })
      : [];
    return {
      candidates: mappedCandidates.length ? mappedCandidates : await this.findArtistLibraryTracks(libraryId, artist),
      fromMappedFolder: mappedCandidates.length > 0,
    };
  }

  async sync(cdEntryId: number, tracks: PersonalTrackDescriptor[]) {
    const [library, entry] = await Promise.all([
      this.getMusicLibrary(),
      this.prisma.cdEntry.findUnique({ where: { id: cdEntryId } }),
    ]);
    if (!library || !entry) {
      return { kind: 'missing' as const, error: library ? 'Catalog entry not found.' : 'Choose and scan a music library folder first.' };
    }
    const { candidates, fromMappedFolder } = await this.trackCandidates(library.id, entry.artist, entry.personalAlbumFolderPath);
    const existingMatches = await this.prisma.personalTrackMatch.findMany({ where: { cdEntryId }, include: { libraryTrack: true } });
    const indexedTrackCount = candidates.length || await this.prisma.musicLibraryTrack.count({ where: { libraryId: library.id } });
    if (!candidates.length) {
      return { kind: 'resolved' as const, value: {
        status: indexedTrackCount ? 'notFound' : 'unindexed', matchedCount: 0, unmatchedCount: tracks.length, matches: existingMatches,
      } };
    }

    const previousMatchByKey = new Map(existingMatches.map((match) => [match.trackKey, match.libraryTrackId]));
    const usedLibraryTrackIds = new Set<number>();
    const physicalKeyByTrackKey = physicalTrackKeys(tracks);
    const libraryTrackByPhysicalKey = new Map<string, number>();
    let matchedCount = 0;
    for (const track of tracks) {
      const physicalKey = physicalKeyByTrackKey.get(track.trackKey) ?? `track:${track.trackKey}`;
      const sharedLibraryTrackId = libraryTrackByPhysicalKey.get(physicalKey);
      const rankedCandidates = rankTrackCandidates(candidates, entry.title, track, fromMappedFolder)
        .filter(({ candidate }) => !usedLibraryTrackIds.has(candidate.id)
          || previousMatchByKey.get(track.trackKey) === candidate.id
          || sharedLibraryTrackId === candidate.id);
      const libraryTrack = rankedCandidates.find(({ candidate }) => candidate.id === sharedLibraryTrackId)?.candidate ?? rankedCandidates[0]?.candidate;
      if (!libraryTrack) continue;
      usedLibraryTrackIds.add(libraryTrack.id);
      libraryTrackByPhysicalKey.set(physicalKey, libraryTrack.id);
      await this.prisma.personalTrackMatch.upsert({
        where: { cdEntryId_trackKey: { cdEntryId, trackKey: track.trackKey } },
        create: { cdEntryId, trackKey: track.trackKey, libraryTrackId: libraryTrack.id },
        update: { libraryTrackId: libraryTrack.id, matchedAt: new Date() },
      });
      matchedCount += 1;
    }
    const matches = await this.prisma.personalTrackMatch.findMany({ where: { cdEntryId }, include: { libraryTrack: true } });
    return { kind: 'resolved' as const, value: {
      status: matchedCount ? 'matched' : 'notFound',
      matchedCount,
      unmatchedCount: tracks.length - matchedCount,
      matches,
    } };
  }

  async findTrack(cdEntryId: number, track: PersonalTrackDescriptor) {
    const [library, entry] = await Promise.all([this.getMusicLibrary(), this.prisma.cdEntry.findUnique({ where: { id: cdEntryId } })]);
    if (!library || !entry) {
      return { kind: 'missing' as const, error: library ? 'Catalog entry not found.' : 'Choose and scan a music library folder first.' };
    }
    const { candidates, fromMappedFolder } = await this.trackCandidates(library.id, entry.artist, entry.personalAlbumFolderPath);
    const rankedCandidates = rankTrackCandidates(candidates, entry.title, track, fromMappedFolder);
    const libraryTrack = rankedCandidates[0]?.candidate ?? null;
    if (!libraryTrack) {
      const trackCount = await this.prisma.musicLibraryTrack.count({ where: { libraryId: library.id } });
      return { kind: 'resolved' as const, value: { status: trackCount ? 'notFound' : 'unindexed', match: null } };
    }
    const match = await this.prisma.personalTrackMatch.upsert({
      where: { cdEntryId_trackKey: { cdEntryId, trackKey: track.trackKey } },
      create: { cdEntryId, trackKey: track.trackKey, libraryTrackId: libraryTrack.id },
      update: { libraryTrackId: libraryTrack.id, matchedAt: new Date() },
      include: { libraryTrack: true },
    });
    return { kind: 'resolved' as const, value: { status: 'matched', match, matchType: rankedCandidates[0].albumScore === 1 && rankedCandidates[0].titleScore === 1 ? 'exact' : 'close' } };
  }

  async findAlbums(cdEntryId: number) {
    const [library, entry] = await Promise.all([this.getMusicLibrary(), this.prisma.cdEntry.findUnique({ where: { id: cdEntryId } })]);
    if (!library || !entry) {
      return { kind: 'missing' as const, error: library ? 'Catalog entry not found.' : 'Choose and scan a music library folder first.' };
    }
    const artistCandidates = await this.findArtistLibraryTracks(library.id, entry.artist);
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
    const trackCount = await this.prisma.musicLibraryTrack.count({ where: { libraryId: library.id } });
    return { kind: 'resolved' as const, value: { status: albums.length ? 'found' : (trackCount ? 'notFound' : 'unindexed'), albums, mappedFolderPath: entry.personalAlbumFolderPath } };
  }

  async setAlbumFolder(entryId: number, folderPath: string | null) {
    const library = await this.getMusicLibrary();
    if (!library) {
      return { kind: 'missing' as const, error: 'Choose and scan a music library folder first.' };
    }
    let resolvedFolderPath: string | null = null;
    if (folderPath) {
      resolvedFolderPath = path.resolve(folderPath);
      if (!pathIsWithinRoot(library.rootPath, resolvedFolderPath) || !await isDirectory(resolvedFolderPath)) {
        return { kind: 'invalid' as const, error: 'Choose an existing album folder inside the configured music library.' };
      }
      const indexedTracks = await this.prisma.musicLibraryTrack.count({ where: { libraryId: library.id, filePath: { startsWith: `${resolvedFolderPath}${path.sep}` } } });
      if (!indexedTracks) {
        return { kind: 'invalid' as const, error: 'That folder has no indexed audio tracks. Scan the music library first.' };
      }
    }
    try {
      const entry = await this.prisma.cdEntry.update({ where: { id: entryId }, data: { personalAlbumFolderPath: resolvedFolderPath, personalAlbumFolderMappedAt: resolvedFolderPath ? new Date() : null } });
      return { kind: 'resolved' as const, value: entry };
    } catch {
      return { kind: 'missing' as const, error: 'Catalog entry not found.' };
    }
  }

  async validateAlbumFolder(entryId: number, folderPath: string, discogsToken?: string) {
    const [library, entry] = await Promise.all([this.getMusicLibrary(), this.prisma.cdEntry.findUnique({ where: { id: entryId } })]);
    if (!library || !entry?.discogsId || !discogsToken) {
      return { kind: 'invalid' as const, error: 'A scanned music library and Discogs release are required for validation.' };
    }
    const resolvedFolderPath = path.resolve(folderPath);
    if (!pathIsWithinRoot(library.rootPath, resolvedFolderPath)) {
      return { kind: 'invalid' as const, error: 'Choose an album folder inside the configured music library.' };
    }
    const indexedTracks = await this.prisma.musicLibraryTrack.findMany({ where: { libraryId: library.id, filePath: { startsWith: `${resolvedFolderPath}${path.sep}` } }, select: { id: true, title: true } });
    try {
      const releaseTracks = (await getDiscogsReleaseTracklist(entry.discogsId, discogsToken)).filter((track) => !track.isComposite);
      const remaining = [...indexedTracks];
      const matched = releaseTracks.every((releaseTrack) => {
        const bestIndex = remaining.reduce((best, candidate, index) => scoreMusicTitleMatch(releaseTrack.title, candidate.title) >= 0.75 && (best < 0 || scoreMusicTitleMatch(releaseTrack.title, candidate.title) > scoreMusicTitleMatch(releaseTrack.title, remaining[best].title)) ? index : best, -1);
        if (bestIndex < 0) return false;
        remaining.splice(bestIndex, 1);
        return true;
      });
      return { kind: 'resolved' as const, value: { valid: matched && releaseTracks.length === indexedTracks.length, releaseTrackCount: releaseTracks.length, folderTrackCount: indexedTracks.length } };
    } catch (error) {
      console.error('Personal album folder validation failed:', error);
      return { kind: 'unavailable' as const, error: 'Unable to validate this album folder against Discogs right now.' };
    }
  }
}

function rankTrackCandidates(
  candidates: MusicLibraryTrack[],
  albumTitle: string,
  track: PersonalTrackDescriptor,
  fromMappedFolder: boolean,
) {
  return candidates
    .map((candidate) => {
      const albumScore = scoreMusicTitleMatch(albumTitle, candidate.album);
      const titleScore = scoreMusicTitleMatch(track.title, candidate.title);
      const trackNumberMatches = track.sequenceNumber !== undefined && candidate.trackNumber === track.sequenceNumber;
      const score = (albumScore * 0.5) + (titleScore * 0.4) + (trackNumberMatches ? 0.1 : 0);
      return { candidate, albumScore, titleScore, trackNumberMatches, score };
    })
    .filter(({ albumScore, titleScore, trackNumberMatches }) =>
      (fromMappedFolder || albumScore >= 0.55) &&
      (titleScore >= 0.75 || trackNumberMatches && titleScore >= 0.55))
    .sort((left, right) => right.score - left.score
      || Number(right.trackNumberMatches) - Number(left.trackNumberMatches)
      || right.titleScore - left.titleScore);
}
