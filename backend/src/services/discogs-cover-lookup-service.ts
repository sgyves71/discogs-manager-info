export type DiscogsCoverFetcher = (releaseId: number) => Promise<string | null>;

export class DiscogsCoverLookupService {
  private readonly cache = new Map<number, string | null>();
  private readonly pendingLookups = new Map<number, Promise<string | null>>();

  constructor(private readonly fetchCover: DiscogsCoverFetcher) {}

  async getCover(releaseId: number): Promise<string | null> {
    if (this.cache.has(releaseId)) return this.cache.get(releaseId) ?? null;

    let lookup = this.pendingLookups.get(releaseId);
    if (!lookup) {
      lookup = this.fetchCover(releaseId)
        .then((coverImage) => {
          this.cache.set(releaseId, coverImage);
          return coverImage;
        })
        .finally(() => this.pendingLookups.delete(releaseId));
      this.pendingLookups.set(releaseId, lookup);
    }
    return lookup;
  }
}
