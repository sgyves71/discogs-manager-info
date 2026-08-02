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
      data: { tracks: [{ trackKey: '1|Stage Song One', title: 'Stage Song One' }, { trackKey: '2|Stage Song Two', title: 'Stage Song Two' }] },
    });
    await expect(syncResponse).toBeOK();
    const sync = await syncResponse.json() as { matchedCount: number; unmatchedCount: number; matches: PersonalTrackMatch[] };
    expect(sync.matchedCount).toBe(2);
    expect(sync.unmatchedCount).toBe(0);

    const matches = [...sync.matches].sort((left, right) => (left.libraryTrack.trackNumber ?? 0) - (right.libraryTrack.trackNumber ?? 0));
    expect(matches.map((match) => match.libraryTrack.title)).toEqual(['Stage Song One', 'Stage Song Two']);

    const nextOnAlbum = await request.get(`${apiUrl}/api/music-library/playback/next?${new URLSearchParams({ cdEntryId: String(stageAlbum!.id), trackId: String(matches[0].libraryTrack.id) })}`);
    await expect(nextOnAlbum).toBeOK();
    expect(await nextOnAlbum.json()).toMatchObject({ next: { title: 'Stage Song Two', catalogEntryId: stageAlbum!.id } });

    const nextAlbum = await request.get(`${apiUrl}/api/music-library/playback/next?${new URLSearchParams({ cdEntryId: String(stageAlbum!.id), trackId: String(matches[1].libraryTrack.id) })}`);
    await expect(nextAlbum).toBeOK();
    const nextAlbumPayload = await nextAlbum.json() as { next: { trackId: number; catalogEntryId: number; title: string } | null };
    expect(nextAlbumPayload.next).toMatchObject({ title: 'Zeta Song' });

    const endOfQueue = await request.get(`${apiUrl}/api/music-library/playback/next?${new URLSearchParams({ cdEntryId: String(nextAlbumPayload.next!.catalogEntryId), trackId: String(nextAlbumPayload.next!.trackId) })}`);
    await expect(endOfQueue).toBeOK();
    expect(await endOfQueue.json()).toEqual({ next: null });
  });
});
