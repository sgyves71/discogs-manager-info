import type { PrismaClient } from '@prisma/client';

export type DiscogsCollectionClient = {
  getUsername(): Promise<string>;
  getReleases(username: string): Promise<Array<{ releaseId: number; instanceId: number | null }>>;
  addRelease(username: string, releaseId: number): Promise<number | null>;
};

export type DiscogsCollectionSyncState = {
  status: 'idle' | 'running' | 'complete' | 'failed';
  total: number;
  processed: number;
  added: number;
  alreadyInCollection: number;
  skipped: number;
  failed: number;
  username: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

const initialState = (): DiscogsCollectionSyncState => ({
  status: 'idle', total: 0, processed: 0, added: 0, alreadyInCollection: 0, skipped: 0, failed: 0,
  username: null, error: null, startedAt: null, completedAt: null,
});

/** Adds local releases to the authenticated Discogs collection without ever removing remote entries. */
export class DiscogsCollectionSyncService {
  private readonly stateValue = initialState();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly client?: DiscogsCollectionClient,
  ) {}

  get state(): DiscogsCollectionSyncState {
    return { ...this.stateValue };
  }

  async getPreview() {
    const [eligible, previouslySynced] = await Promise.all([
      this.prisma.cdEntry.count({ where: { discogsId: { not: null } } }),
      this.prisma.cdEntry.count({ where: { discogsId: { not: null }, discogsCollectionSyncStatus: { in: ['SYNCED', 'ALREADY_IN_COLLECTION'] } } }),
    ]);
    return { configured: Boolean(this.client), eligible, previouslySynced, pending: Math.max(0, eligible - previouslySynced) };
  }

  async start(): Promise<void> {
    if (this.stateValue.status === 'running') throw new Error('A Discogs collection sync is already running.');
    if (!this.client) throw new Error('Discogs authentication is not configured.');

    Object.assign(this.stateValue, initialState(), { status: 'running', startedAt: new Date().toISOString() });
    try {
      await this.run(this.client);
      this.stateValue.status = 'complete';
      this.stateValue.completedAt = new Date().toISOString();
    } catch (error) {
      this.stateValue.status = 'failed';
      this.stateValue.error = error instanceof Error ? error.message : 'Discogs collection sync failed.';
      this.stateValue.completedAt = new Date().toISOString();
      throw error;
    }
  }

  private async run(client: DiscogsCollectionClient) {
    const entries = await this.prisma.cdEntry.findMany({
      where: { discogsId: { not: null } },
      select: { id: true, discogsId: true, discogsCollectionSyncStatus: true },
      orderBy: { id: 'asc' },
    });
    this.stateValue.total = entries.length;

    const username = await client.getUsername();
    this.stateValue.username = username;
    const remoteReleases = await client.getReleases(username);
    const remoteByReleaseId = new Map(remoteReleases.map((release) => [release.releaseId, release.instanceId]));

    for (const entry of entries) {
      const releaseId = entry.discogsId!;
      try {
        const remoteInstanceId = remoteByReleaseId.get(releaseId);
        if (remoteInstanceId !== undefined) {
          await this.prisma.cdEntry.update({ where: { id: entry.id }, data: { discogsCollectionSyncStatus: 'ALREADY_IN_COLLECTION', discogsCollectionInstanceId: remoteInstanceId, discogsCollectionSyncedAt: new Date() } });
          this.stateValue.alreadyInCollection += 1;
        } else {
          const instanceId = await client.addRelease(username, releaseId);
          await this.prisma.cdEntry.update({ where: { id: entry.id }, data: { discogsCollectionSyncStatus: 'SYNCED', discogsCollectionInstanceId: instanceId, discogsCollectionSyncedAt: new Date() } });
          this.stateValue.added += 1;
        }
      } catch (error) {
        this.stateValue.failed += 1;
        if (error instanceof Error && (error.name === 'TimeoutError' ||
            ('code' in error && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')))) {
          this.stateValue.error = 'Discogs took too long to respond.';
        }
        await this.prisma.cdEntry.update({ where: { id: entry.id }, data: { discogsCollectionSyncStatus: 'FAILED' } });
        console.error(`Discogs collection sync failed for release ${releaseId}:`, error);
      } finally {
        this.stateValue.processed += 1;
      }
    }
  }
}
