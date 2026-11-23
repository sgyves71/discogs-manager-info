import type { PrismaClient } from '@prisma/client';
import { cleanDiscogsText, stripDiscogsArtistDisambiguator } from '../discogs.js';

export function catalogArtistSortName(artist: string): string {
  return artist.replace(/^the\s+/iu, '').trim() || artist;
}

export async function normalizeStoredCatalogText(prisma: PrismaClient) {
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
