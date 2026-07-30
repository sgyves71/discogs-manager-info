import axios from 'axios';
import type { PrismaClient } from '@prisma/client';
import { getDiscogsReleaseCatalogInfo, getDiscogsReleaseContext, getDiscogsReleaseCover } from '../discogs.js';
import { fetchDiscogsMarketStats } from '../discogs-market-stats.js';

export type BackfillState = {
  status: 'idle' | 'running' | 'complete' | 'failed';
  processed: number;
  stored?: number;
  updated?: number;
  skipped: number;
  total: number;
  error: string | null;
};

export class CatalogEnrichmentService {
  readonly coverBackfill: BackfillState = { status: 'idle', processed: 0, stored: 0, skipped: 0, total: 0, error: null };
  readonly releaseInfoBackfill: BackfillState = { status: 'idle', processed: 0, updated: 0, skipped: 0, total: 0, error: null };
  readonly contextBackfill: BackfillState = { status: 'idle', processed: 0, stored: 0, skipped: 0, total: 0, error: null };
  readonly genreStyleBackfill: BackfillState = { status: 'idle', processed: 0, stored: 0, skipped: 0, total: 0, error: null };
  readonly marketStatsBackfill: BackfillState = { status: 'idle', processed: 0, stored: 0, skipped: 0, total: 0, error: null };

  constructor(private readonly prisma: PrismaClient, private readonly discogsToken?: string, private readonly isStageEnvironment = false) {}

  get hasDiscogsAccess(): boolean {
    return Boolean(this.discogsToken);
  }

  async storeCover(cdEntryId: number, discogsId: number): Promise<boolean> {
    if (!this.discogsToken) return false;
    const coverUrl = await getDiscogsReleaseCover(discogsId, this.discogsToken);
    if (!coverUrl) return false;
    const response = await axios.get<ArrayBuffer>(coverUrl, {
      responseType: 'arraybuffer', timeout: 12_000, maxContentLength: 1_500_000,
      headers: { 'User-Agent': 'DiscogsManager/0.1 +http://localhost' },
    });
    const mimeType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const imageData = Buffer.from(response.data);
    if (!mimeType.startsWith('image/') || !imageData.length || imageData.length > 1_500_000) return false;
    await this.prisma.cdEntry.update({
      where: { id: cdEntryId },
      data: { coverImageData: imageData, coverImageMimeType: mimeType, coverImageUpdatedAt: new Date() },
    });
    return true;
  }

  async storeContext(cdEntryId: number, discogsId: number): Promise<boolean> {
    if (!this.discogsToken) return false;
    const context = await getDiscogsReleaseContext(discogsId, this.discogsToken);
    await this.prisma.cdEntry.update({
      where: { id: cdEntryId },
      data: {
        artistSummary: context.artistProfile,
        discogsNotes: context.description,
        discogsNotesSource: context.descriptionSource,
        discogsContextUpdatedAt: new Date(),
        genre: context.genre,
        style: context.style,
      },
    });
    return Boolean(context.artistProfile || context.description);
  }

  async startCoverBackfill(): Promise<void> {
    await this.runBackfill(this.coverBackfill, async () => this.prisma.cdEntry.findMany({ where: { discogsId: { not: null }, coverImageData: null }, select: { id: true, discogsId: true } }), async (entry) => this.storeCover(entry.id, entry.discogsId!));
  }

  async startReleaseInfoBackfill(): Promise<void> {
    this.reset(this.releaseInfoBackfill);
    try {
      const entries = await this.prisma.cdEntry.findMany({ where: { discogsId: { not: null } }, select: { id: true, discogsId: true } });
      this.releaseInfoBackfill.total = entries.length;
      for (const entry of entries) {
        this.releaseInfoBackfill.processed += 1;
        try {
          if (!entry.discogsId || !this.discogsToken) throw new Error('Discogs is unavailable.');
          const info = await getDiscogsReleaseCatalogInfo(entry.discogsId, this.discogsToken);
          await this.prisma.cdEntry.update({ where: { id: entry.id }, data: { label: info.label, catalogNumber: info.catalogNumber, barcode: info.barcode } });
          this.releaseInfoBackfill.updated = (this.releaseInfoBackfill.updated ?? 0) + 1;
        } catch {
          this.releaseInfoBackfill.skipped += 1;
        }
      }
      this.releaseInfoBackfill.status = 'complete';
    } catch (error) {
      this.releaseInfoBackfill.status = 'failed';
      this.releaseInfoBackfill.error = error instanceof Error ? error.message : 'Unable to backfill release labels.';
    }
  }

  async startContextBackfill(): Promise<void> {
    await this.runBackfill(this.contextBackfill, async () => this.prisma.cdEntry.findMany({ where: { discogsId: { not: null }, discogsContextUpdatedAt: null }, select: { id: true, discogsId: true } }), async (entry) => this.storeContext(entry.id, entry.discogsId!));
  }

  async startGenreStyleBackfill(): Promise<void> {
    await this.runBackfill(this.genreStyleBackfill, async () => this.prisma.cdEntry.findMany({ where: { discogsId: { not: null }, OR: [{ genre: null }, { style: null }] }, select: { id: true, discogsId: true } }), async (entry) => this.storeContext(entry.id, entry.discogsId!));
  }

  async startMarketStatsBackfill(): Promise<void> {
    await this.runBackfill(
      this.marketStatsBackfill,
      async () => this.prisma.cdEntry.findMany({ where: { discogsId: { not: null } }, select: { id: true, discogsId: true } }),
      async (entry) => this.refreshMarketStats(entry.id, entry.discogsId!),
    );
  }

  async refreshMarketStats(cdEntryId: number, discogsId: number): Promise<boolean> {
    if (this.isStageEnvironment) return false;
    const marketStats = await fetchDiscogsMarketStats(discogsId);
    await this.prisma.cdEntry.update({
      where: { id: cdEntryId },
      data: {
        discogsLastSoldAt: marketStats.lastSoldAt,
        discogsMarketLow: marketStats.low,
        discogsMarketMedian: marketStats.median,
        discogsMarketHigh: marketStats.high,
        discogsMarketCurrency: marketStats.currency,
        discogsMarketStatsCheckedAt: new Date(),
      },
    });
    return Boolean(marketStats.lastSoldAt || marketStats.low != null || marketStats.median != null || marketStats.high != null);
  }

  private reset(state: BackfillState): void {
    state.status = 'running'; state.processed = 0; state.stored = 0; state.updated = 0; state.skipped = 0; state.total = 0; state.error = null;
  }

  private async runBackfill(state: BackfillState, loadEntries: () => Promise<Array<{ id: number; discogsId: number | null }>>, store: (entry: { id: number; discogsId: number | null }) => Promise<boolean>): Promise<void> {
    this.reset(state);
    try {
      const entries = await loadEntries();
      state.total = entries.length;
      for (const entry of entries) {
        state.processed += 1;
        try {
          if (entry.discogsId && await store(entry)) state.stored = (state.stored ?? 0) + 1;
          else state.skipped += 1;
        } catch {
          state.skipped += 1;
        }
      }
      state.status = 'complete';
    } catch (error) {
      state.status = 'failed';
      state.error = error instanceof Error ? error.message : 'Unable to complete catalog backfill.';
    }
  }
}
