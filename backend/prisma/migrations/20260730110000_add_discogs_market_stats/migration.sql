ALTER TABLE "CdEntry" ADD COLUMN "discogsLastSoldAt" DATETIME;
ALTER TABLE "CdEntry" ADD COLUMN "discogsMarketLow" REAL;
ALTER TABLE "CdEntry" ADD COLUMN "discogsMarketMedian" REAL;
ALTER TABLE "CdEntry" ADD COLUMN "discogsMarketHigh" REAL;
ALTER TABLE "CdEntry" ADD COLUMN "discogsMarketCurrency" TEXT;
ALTER TABLE "CdEntry" ADD COLUMN "discogsMarketStatsCheckedAt" DATETIME;
