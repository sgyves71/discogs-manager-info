-- CreateTable
CREATE TABLE "YouTubeTrackMatch" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "cdEntryId" INTEGER NOT NULL,
  "trackKey" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "videoTitle" TEXT NOT NULL,
  "videoUrl" TEXT NOT NULL,
  "selectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "YouTubeTrackMatch_cdEntryId_fkey" FOREIGN KEY ("cdEntryId") REFERENCES "CdEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeTrackMatch_cdEntryId_trackKey_key" ON "YouTubeTrackMatch"("cdEntryId", "trackKey");
