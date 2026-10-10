-- CreateEnum
CREATE TYPE "PlaylistLicense" AS ENUM ('EVERYONE', 'INVITED');

-- CreateTable
CREATE TABLE "playlists" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC',
    "license" "PlaylistLicense" NOT NULL DEFAULT 'EVERYONE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastEditorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_invites" (
    "playlistId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_invites_pkey" PRIMARY KEY ("playlistId","userId")
);

-- CreateTable
CREATE TABLE "playlist_tracks" (
    "id" UUID NOT NULL,
    "playlistId" UUID NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "playlists_ownerId_idx" ON "playlists"("ownerId");

-- CreateIndex
CREATE INDEX "playlists_visibility_createdAt_idx" ON "playlists"("visibility", "createdAt");

-- CreateIndex
CREATE INDEX "playlist_invites_userId_idx" ON "playlist_invites"("userId");

-- CreateIndex
CREATE INDEX "playlist_tracks_playlistId_position_idx" ON "playlist_tracks"("playlistId", "position");

-- CreateIndex
CREATE INDEX "playlist_tracks_addedById_idx" ON "playlist_tracks"("addedById");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_tracks_playlistId_trackId_key" ON "playlist_tracks"("playlistId", "trackId");

-- AddForeignKey
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_lastEditorId_fkey" FOREIGN KEY ("lastEditorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_invites" ADD CONSTRAINT "playlist_invites_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_invites" ADD CONSTRAINT "playlist_invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
