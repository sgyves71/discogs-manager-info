import { expect, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://localhost:3100';
const isStage = process.env.E2E_STAGE === 'true';

type PersonalTrackMatch = {
  trackKey: string;
  libraryTrack: { id: number; title: string; trackNumber: number | null };
};

test.describe('Stage Personal Playback', () => {
  test.skip(!isStage, 'Personal-playback coverage runs only against the disposable Stage database.');

  test('Synchronizes a Release and Continues Through the Playable Queue', async ({ request }) => {
    const catalogResponse = await request.get(`${apiUrl}/api/cds?${new URLSearchParams({ q: 'Stage Album', page: '1', pageSize: '10' })}`);
    await expect(catalogResponse).toBeOK();
    const catalog = await catalogResponse.json() as { items: Array<{ id: number; title: string }> };
    const stageAlbum = catalog.items.find((entry) => entry.title === 'Stage Album');
    expect(stageAlbum).toBeDefined();

    const catalogScan = await request.post(`${apiUrl}/api/music-library/catalog-personal-locations/scan`);
    expect(catalogScan.status()).toBe(202);
    let catalogLocationScan: { status: string; matched: number; unmatched: number } | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const libraryResponse = await request.get(`${apiUrl}/api/music-library`);
      await expect(libraryResponse).toBeOK();
      catalogLocationScan = (await libraryResponse.json() as { catalogLocationScan: { status: string; matched: number; unmatched: number } }).catalogLocationScan;
      if (catalogLocationScan.status !== 'scanning') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(catalogLocationScan).toMatchObject({ status: 'complete', matched: 2, unmatched: 0 });

    const entryId = String(stageAlbum!.id);
    const albumsResponse = await request.get(`${apiUrl}/api/music-library/albums/find?${new URLSearchParams({ cdEntryId: entryId })}`);
    await expect(albumsResponse).toBeOK();
    const albums = await albumsResponse.json();
    expect(albums).toMatchObject({
      status: 'found',
      albums: [{ album: 'Stage Album', trackCount: 2, matchType: 'exact' }],
      mappedFolderPath: expect.any(String),
    });
    const folderUrl = `${apiUrl}/api/cds/${entryId}/personal-album-folder`;
    const folder = { folderPath: albums.albums[0].folderPath };
    const mapping = await request.patch(folderUrl, { data: folder });
    await expect(mapping).toBeOK();
    expect(await mapping.json()).toMatchObject({ personalAlbumFolderPath: folder.folderPath });
    const validation = await request.post(`${folderUrl}/validate`, { data: folder });
    expect(validation.status()).toBe(400);
    expect(await validation.json()).toEqual({ error: 'A scanned music library and Discogs release are required for validation.' });

    const matchesUrl = `${apiUrl}/api/cds/${stageAlbum!.id}/personal-track-matches`;
    const data = { tracks: [{ trackKey: '1|Stage Song One', title: 'Stage Song One' }] };
    const syncResponse = await request.post(`${matchesUrl}/sync`, { data });
    await expect(syncResponse).toBeOK();
    const sync = await syncResponse.json() as { matchedCount: number; unmatchedCount: number; matches: PersonalTrackMatch[] };
    expect(sync.matchedCount).toBe(1);
    expect(sync.unmatchedCount).toBe(0);

    const matches = [...sync.matches].sort((left, right) => (left.libraryTrack.trackNumber ?? 0) - (right.libraryTrack.trackNumber ?? 0));
    expect(matches.map((match) => match.libraryTrack.title)).toEqual(['Stage Song One']);

    const lookup = await request.get(`${apiUrl}/api/music-library/matches/find?${new URLSearchParams({
      cdEntryId: entryId, trackKey: data.tracks[0].trackKey, trackTitle: data.tracks[0].title,
    })}`);
    await expect(lookup).toBeOK();
    expect(await lookup.json()).toMatchObject({
      status: 'matched', matchType: 'exact', match: { libraryTrack: { title: 'Stage Song One' } },
    });

    const repeatedSync = await request.post(`${matchesUrl}/sync`, { data });
    await expect(repeatedSync).toBeOK();
    expect(await repeatedSync.json()).toMatchObject({ matchedCount: 1, unmatchedCount: 0, matches: [
      { trackKey: data.tracks[0].trackKey, libraryTrack: { id: matches[0].libraryTrack.id } },
    ] });
    const persisted = await request.get(matchesUrl);
    await expect(persisted).toBeOK();
    expect(await persisted.json()).toMatchObject({ matches: [
      { trackKey: data.tracks[0].trackKey, libraryTrack: { id: matches[0].libraryTrack.id } },
    ] });

    const nextOnAlbum = await request.get(`${apiUrl}/api/music-library/playback/next?${new URLSearchParams({ cdEntryId: String(stageAlbum!.id), trackId: String(matches[0].libraryTrack.id) })}`);
    await expect(nextOnAlbum).toBeOK();
    const nextOnAlbumPayload = await nextOnAlbum.json() as { next: { trackId: number; title: string; catalogEntryId: number } | null };
    expect(nextOnAlbumPayload).toMatchObject({ next: { title: 'Stage Song Two', catalogEntryId: stageAlbum!.id } });

    const firstInQueue = await request.get(`${apiUrl}/api/music-library/playback/previous?${new URLSearchParams({ cdEntryId: String(stageAlbum!.id), trackId: String(matches[0].libraryTrack.id) })}`);
    await expect(firstInQueue).toBeOK();
    expect(await firstInQueue.json()).toEqual({ previous: null });

    const previousOnAlbum = await request.get(`${apiUrl}/api/music-library/playback/previous?${new URLSearchParams({ cdEntryId: String(stageAlbum!.id), trackId: String(nextOnAlbumPayload.next!.trackId) })}`);
    await expect(previousOnAlbum).toBeOK();
    expect(await previousOnAlbum.json()).toMatchObject({ previous: { title: 'Stage Song One', catalogEntryId: stageAlbum!.id } });

    const nextAlbum = await request.get(`${apiUrl}/api/music-library/playback/next?${new URLSearchParams({ cdEntryId: String(stageAlbum!.id), trackId: String(nextOnAlbumPayload.next!.trackId) })}`);
    await expect(nextAlbum).toBeOK();
    const nextAlbumPayload = await nextAlbum.json() as { next: { trackId: number; catalogEntryId: number; title: string } | null };
    expect(nextAlbumPayload.next).toMatchObject({ title: 'Zeta Song' });

    const previousAlbum = await request.get(`${apiUrl}/api/music-library/playback/previous?${new URLSearchParams({ cdEntryId: String(nextAlbumPayload.next!.catalogEntryId), trackId: String(nextAlbumPayload.next!.trackId) })}`);
    await expect(previousAlbum).toBeOK();
    expect(await previousAlbum.json()).toMatchObject({ previous: { title: 'Stage Song Two', catalogEntryId: stageAlbum!.id } });

    const endOfQueue = await request.get(`${apiUrl}/api/music-library/playback/next?${new URLSearchParams({ cdEntryId: String(nextAlbumPayload.next!.catalogEntryId), trackId: String(nextAlbumPayload.next!.trackId) })}`);
    await expect(endOfQueue).toBeOK();
    expect(await endOfQueue.json()).toEqual({ next: null });
  });
});
