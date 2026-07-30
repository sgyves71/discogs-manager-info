import { expect, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://localhost:3100';
const isStage = process.env.E2E_STAGE === 'true';

test.describe('Stage Music Library', () => {
  test.skip(!isStage, 'Music-library fixture coverage runs only against the disposable Stage database.');

  test('Lists the Seeded Music Library and Indexed Tracks', async ({ request }) => {
    const response = await request.get(`${apiUrl}/api/music-library`);
    await expect(response).toBeOK();
    const library = await response.json() as { rootPath: string | null; trackCount: number };
    expect(library.rootPath).toContain('e2e');
    expect(library.rootPath).toContain('fixtures');
    expect(library.trackCount).toBe(2);
  });

  test('Lists Indexed Artist and Album Folders', async ({ request }) => {
    const artistsResponse = await request.get(`${apiUrl}/api/music-library/folders/artists`);
    await expect(artistsResponse).toBeOK();
    const artists = await artistsResponse.json() as { folders: Array<{ folderPath: string; name: string; trackCount: number }> };
    expect(artists.folders).toHaveLength(1);
    expect(artists.folders[0]).toMatchObject({ name: 'Stage Artist', trackCount: 2 });

    const albumsResponse = await request.get(`${apiUrl}/api/music-library/folders/albums?${new URLSearchParams({ artistFolderPath: artists.folders[0].folderPath })}`);
    await expect(albumsResponse).toBeOK();
    const albums = await albumsResponse.json() as { folders: Array<{ name: string; album: string; trackCount: number }> };
    expect(albums.folders).toEqual([expect.objectContaining({ name: 'Stage Album', album: 'Stage Album', trackCount: 2 })]);
  });

  test('Rejects a Music Library Path Outside the File System', async ({ request }) => {
    const response = await request.put(`${apiUrl}/api/music-library`, { data: { rootPath: 'not-an-absolute-path' } });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Choose an absolute folder path for your music library.' });
  });
});
