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
});
