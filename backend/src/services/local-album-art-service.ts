import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';

export type AlbumArt = { data: Buffer; mimeType: string };

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const COVER_NAMES = ['folder', 'cover', 'front', 'albumart', 'album art'];

export class LocalAlbumArtService {
  private readonly cache = new Map<string, { expiresAt: number; art: AlbumArt | null }>();

  constructor(private readonly cacheDurationMs = 5 * 60 * 1000) {}

  async find(folderPath: string, trackPaths: string[]): Promise<AlbumArt | null> {
    const cacheKey = path.resolve(folderPath).toLocaleLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.art;

    const art = await this.findEmbeddedArt(trackPaths) ?? await this.findFolderArt(folderPath);
    this.cache.set(cacheKey, { expiresAt: Date.now() + this.cacheDurationMs, art });
    return art;
  }

  clear(): void {
    this.cache.clear();
  }

  private async findEmbeddedArt(trackPaths: string[]): Promise<AlbumArt | null> {
    for (const trackPath of trackPaths.slice(0, 8)) {
      try {
        const metadata = await parseFile(trackPath, { duration: false, skipCovers: false });
        const pictures = metadata.common.picture ?? [];
        const picture = pictures.find((candidate) => candidate.type?.toLocaleLowerCase().includes('front')) ?? pictures[0];
        if (picture?.data?.length && picture.format?.startsWith('image/')) {
          return { data: Buffer.from(picture.data), mimeType: picture.format };
        }
      } catch {
        // A damaged tag must not prevent trying another track or the folder artwork.
      }
    }
    return null;
  }

  private async findFolderArt(folderPath: string): Promise<AlbumArt | null> {
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      const candidates = entries
        .filter((entry) => entry.isFile() && IMAGE_MIME_TYPES[path.extname(entry.name).toLocaleLowerCase()])
        .map((entry) => ({
          name: entry.name,
          rank: COVER_NAMES.indexOf(path.basename(entry.name, path.extname(entry.name)).toLocaleLowerCase()),
        }))
        .filter((entry) => entry.rank >= 0)
        .sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name));
      const candidate = candidates[0];
      if (!candidate) return null;
      const extension = path.extname(candidate.name).toLocaleLowerCase();
      return { data: await fs.readFile(path.join(folderPath, candidate.name)), mimeType: IMAGE_MIME_TYPES[extension]! };
    } catch {
      return null;
    }
  }
}
