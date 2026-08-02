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

    const syncResponse = await request.post(`${apiUrl}/api/cds/${stageAlbum!.id}/personal-track-matches/sync`, {
      data: { tracks: [{ trackKey: '1|Stage Song One', title: 'Stage Song One' }] },
    });
    await expect(syncResponse).toBeOK();
    const sync = await syncResponse.json() as { matchedCount: number; unmatchedCount: number; matches: PersonalTrackMatch[] };
    expect(sync.matchedCount).toBe(1);
    expect(sync.unmatchedCount).toBe(0);

    const matches = [...sync.matches].sort((left, right) => (left.libraryTrack.trackNumber ?? 0) - (right.libraryTrack.trackNumber ?? 0));
    expect(matches.map((match) => match.libraryTrack.title)).toEqual(['Stage Song One']);

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
