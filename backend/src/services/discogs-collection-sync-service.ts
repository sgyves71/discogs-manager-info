import type { PrismaClient } from '@prisma/client';
import { addDiscogsReleaseToCollection, getDiscogsCollectionReleases, getDiscogsUsername } from '../discogs.js';

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
    private readonly token: string | undefined,
    private readonly stageMode: boolean,
  ) {}

  get state(): DiscogsCollectionSyncState {
    return { ...this.stateValue };
  }

  async getPreview() {
    const [eligible, previouslySynced] = await Promise.all([
      this.prisma.cdEntry.count({ where: { discogsId: { not: null } } }),
      this.prisma.cdEntry.count({ where: { discogsId: { not: null }, discogsCollectionSyncStatus: { in: ['SYNCED', 'ALREADY_IN_COLLECTION'] } } }),
    ]);
    return { configured: Boolean(this.token) || this.stageMode, eligible, previouslySynced, pending: Math.max(0, eligible - previouslySynced) };
  }

  async start(): Promise<void> {
    if (this.stateValue.status === 'running') throw new Error('A Discogs collection sync is already running.');
    if (!this.token && !this.stageMode) throw new Error('Discogs authentication is not configured.');

    Object.assign(this.stateValue, initialState(), { status: 'running', startedAt: new Date().toISOString() });
    try {
      await this.run();
      this.stateValue.status = 'complete';
      this.stateValue.completedAt = new Date().toISOString();
    } catch (error) {
      this.stateValue.status = 'failed';
      this.stateValue.error = error instanceof Error ? error.message : 'Discogs collection sync failed.';
      this.stateValue.completedAt = new Date().toISOString();
      throw error;
    }
  }

  private async run() {
    const entries = await this.prisma.cdEntry.findMany({
      where: { discogsId: { not: null } },
      select: { id: true, discogsId: true, discogsCollectionSyncStatus: true },
      orderBy: { id: 'asc' },
    });
    this.stateValue.total = entries.length;

    if (this.stageMode) {
      this.stateValue.username = 'stage-discogs-user';
      for (const entry of entries) {
        await this.prisma.cdEntry.update({ where: { id: entry.id }, data: { discogsCollectionSyncStatus: 'SYNCED', discogsCollectionInstanceId: entry.discogsId, discogsCollectionSyncedAt: new Date() } });
        this.stateValue.processed += 1;
        this.stateValue.added += 1;
      }
      return;
    }

    const token = this.token!;
    const username = await getDiscogsUsername(token);
    this.stateValue.username = username;
    const remoteReleases = await getDiscogsCollectionReleases(username, token);
    const remoteByReleaseId = new Map(remoteReleases.map((release) => [release.releaseId, release.instanceId]));

    for (const entry of entries) {
      const releaseId = entry.discogsId!;
      try {
        const remoteInstanceId = remoteByReleaseId.get(releaseId);
        if (remoteInstanceId !== undefined) {
          await this.prisma.cdEntry.update({ where: { id: entry.id }, data: { discogsCollectionSyncStatus: 'ALREADY_IN_COLLECTION', discogsCollectionInstanceId: remoteInstanceId, discogsCollectionSyncedAt: new Date() } });
          this.stateValue.alreadyInCollection += 1;
        } else {
          const instanceId = await addDiscogsReleaseToCollection(username, releaseId, token);
          await this.prisma.cdEntry.update({ where: { id: entry.id }, data: { discogsCollectionSyncStatus: 'SYNCED', discogsCollectionInstanceId: instanceId, discogsCollectionSyncedAt: new Date() } });
          this.stateValue.added += 1;
        }
      } catch (error) {
        this.stateValue.failed += 1;
        await this.prisma.cdEntry.update({ where: { id: entry.id }, data: { discogsCollectionSyncStatus: 'FAILED' } });
        console.error(`Discogs collection sync failed for release ${releaseId}:`, error);
      } finally {
        this.stateValue.processed += 1;
      }
    }
  }
}
