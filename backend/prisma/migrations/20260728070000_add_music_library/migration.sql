CREATE TABLE "MusicLibrary" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rootPath" TEXT NOT NULL,
    "lastScannedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "MusicLibrary_rootPath_key" ON "MusicLibrary"("rootPath");

CREATE TABLE "MusicLibraryTrack" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libraryId" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "trackNumber" INTEGER,
    "discNumber" INTEGER,
    "durationSeconds" REAL,
    "format" TEXT,
    "normalizedArtist" TEXT NOT NULL,
    "normalizedAlbum" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "indexedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MusicLibraryTrack_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "MusicLibrary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MusicLibraryTrack_filePath_key" ON "MusicLibraryTrack"("filePath");
CREATE INDEX "MusicLibraryTrack_libraryId_normalizedArtist_normalizedAlbum_normalizedTitle_idx" ON "MusicLibraryTrack"("libraryId", "normalizedArtist", "normalizedAlbum", "normalizedTitle");

CREATE TABLE "PersonalTrackMatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cdEntryId" INTEGER NOT NULL,
    "trackKey" TEXT NOT NULL,
    "libraryTrackId" INTEGER NOT NULL,
    "matchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalTrackMatch_cdEntryId_fkey" FOREIGN KEY ("cdEntryId") REFERENCES "CdEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonalTrackMatch_libraryTrackId_fkey" FOREIGN KEY ("libraryTrackId") REFERENCES "MusicLibraryTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PersonalTrackMatch_cdEntryId_trackKey_key" ON "PersonalTrackMatch"("cdEntryId", "trackKey");
