-- AlterTable
ALTER TABLE "CdEntry" ADD COLUMN "discogsCollectionSyncStatus" TEXT NOT NULL DEFAULT 'NOT_SYNCED';
ALTER TABLE "CdEntry" ADD COLUMN "discogsCollectionInstanceId" INTEGER;
ALTER TABLE "CdEntry" ADD COLUMN "discogsCollectionSyncedAt" DATETIME;
