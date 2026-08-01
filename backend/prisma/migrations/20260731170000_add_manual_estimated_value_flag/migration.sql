-- Preserve the distinction between the $15.00 default and an intentional user override.
ALTER TABLE "CdEntry" ADD COLUMN "estimatedValueIsManual" BOOLEAN NOT NULL DEFAULT false;
