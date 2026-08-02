-- A non-null value marks that the owner explicitly reviewed the estimated value.
ALTER TABLE "CdEntry" ADD COLUMN "estimatedValueReviewedAt" DATETIME;
