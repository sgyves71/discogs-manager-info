ALTER TABLE "CdEntry" ADD COLUMN "artistSortName" TEXT NOT NULL DEFAULT '';
UPDATE "CdEntry"
SET "artistSortName" = CASE
  WHEN lower("artist") LIKE 'the %' THEN substr("artist", 5)
  ELSE "artist"
END;
