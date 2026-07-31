import { expect, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://localhost:3100';
const isStage = process.env.E2E_STAGE === 'true';

test.describe('Stage MusicBrainz Search', () => {
  test.skip(!isStage, 'MusicBrainz mock coverage runs only against the disposable Stage server.');

  test('Returns Stable Artist and Album Search Models', async ({ request }) => {
    const response = await request.get(`${apiUrl}/api/musicbrainz/search?artist=Stage%20Mock%20Artist&album=Mocked%20CD%20Album`);
    await expect(response).toBeOK();
    const payload = await response.json() as { artists: Array<{ name: string; sortName: string }>; releaseGroups: Array<{ title: string; primaryType: string; artistCredits: Array<{ name: string }> }> };
    expect(payload.artists).toEqual([expect.objectContaining({ name: 'Stage Mock Artist', sortName: 'Mock Artist, Stage' })]);
    expect(payload.releaseGroups).toEqual([expect.objectContaining({ title: 'Mocked CD Album', primaryType: 'Album', artistCredits: [expect.objectContaining({ name: 'Stage Mock Artist' })] })]);
  });

  test('Rejects a Search Without Artist or Album Criteria', async ({ request }) => {
    const response = await request.get(`${apiUrl}/api/musicbrainz/search`);
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: 'Provide an artist or album title.' });
  });

  test('Returns MusicBrainz Artist and Album Annotations for Catalog Details', async ({ request }) => {
    const response = await request.get(`${apiUrl}/api/musicbrainz/context?artist=Stage%20Mock%20Artist&album=Mocked%20CD%20Album`);
    await expect(response).toBeOK();
    const payload = await response.json() as { artist: { annotation: string; genres: string[] } | null; releaseGroup: { annotation: string } | null };
    expect(payload.artist).toMatchObject({ annotation: expect.stringContaining('artist-summary fallback'), genres: ['Rock'] });
    expect(payload.releaseGroup).toMatchObject({ annotation: expect.stringContaining('release-group notes') });
  });

  test('Prefers MusicBrainz Context on a Catalog Detail Card', async ({ page, request }) => {
    const create = await request.post(`${apiUrl}/api/cds`, { data: {
      artist: 'Stage Mock Artist', title: 'Mocked CD Album', year: 1988, country: 'US', label: 'Mock Records', format: 'CD, Album',
      discogsId: 900101, discogsUri: '/release/900101', catalogNumber: 'MOCK-CD-001',
    } });
    await expect(create).toBeOK();
    const entry = await create.json() as { id: number };
    try {
      await page.goto('/');
      await page.getByRole('button', { name: 'Catalog' }).click();
      await page.getByText('Mocked CD Album', { exact: true }).click();

      await expect(page.getByText('Artist Details', { exact: false })).toBeVisible();
      await expect(page.getByText('Artist Details - MusicBrainz', { exact: true })).toBeVisible();
      await expect(page.getByText(/MusicBrainz artist-summary fallback order/i).first()).toBeVisible();
      await expect(page.getByText(/MusicBrainz release-group notes/i)).toBeVisible();
    } finally {
      await request.delete(`${apiUrl}/api/cds/${entry.id}`);
    }
  });
});
