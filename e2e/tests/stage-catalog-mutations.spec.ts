import { expect, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://localhost:3100';
const isStage = process.env.E2E_STAGE === 'true';
let entryId: number;
const discogsId = 991001;

test.describe('Stage Catalog Mutations', () => {
  test.skip(!isStage, 'Catalog mutation coverage runs only against the disposable Stage database.');
  test.describe.configure({ mode: 'serial' });

  test('Creates a Catalog Entry With the Default Condition', async ({ request }) => {
    const response = await request.post(`${apiUrl}/api/cds`, {
      data: {
        artist: 'Stage Test Artist',
        title: 'Stage Test Album',
        year: 1999,
        country: 'US',
        label: 'Test Records',
        format: 'CD, Album',
        discogsId,
        discogsUri: `/release/${discogsId}`,
        catalogNumber: 'TEST-001',
      },
    });

    expect(response.status()).toBe(201);
    const created = await response.json() as { id: number; artist: string; title: string; mediaCondition: string | null };
    entryId = created.id;
    expect(created.artist).toBe('Stage Test Artist');
    expect(created.title).toBe('Stage Test Album');
    expect(created.mediaCondition).toBe('Very Good Plus (VG+)');
  });

  test('Finds the Created Entry With a Partial Catalog Search', async ({ request }) => {
    const response = await request.get(`${apiUrl}/api/cds?q=Test%20Album&page=1&pageSize=12`);
    await expect(response).toBeOK();
    const payload = await response.json() as { total: number; items: Array<{ id: number; catalogNumber: string | null }> };
    expect(payload.total).toBe(1);
    expect(payload.items[0]).toMatchObject({ id: entryId, catalogNumber: 'TEST-001' });
  });

  test('Edits Catalog Details and Estimated Value', async ({ request }) => {
    const details = await request.patch(`${apiUrl}/api/cds/${entryId}/details`, {
      data: {
        artist: 'Stage Test Artist (2)',
        title: 'Stage Test Album Revised',
        year: 2000,
        country: 'Canada',
        label: 'Test Records',
        format: 'CD, Album',
        catalogNumber: 'TEST-002',
        barcode: null,
        mediaCondition: 'Very Good Plus (VG+)',
        notes: 'Synthetic mutation coverage.',
      },
    });
    await expect(details).toBeOK();
    expect(await details.json()).toMatchObject({
      artist: 'Stage Test Artist', title: 'Stage Test Album Revised', year: 2000, catalogNumber: 'TEST-002',
    });

    const value = await request.patch(`${apiUrl}/api/cds/${entryId}/estimated-value`, { data: { estimatedValue: 22.5 } });
    await expect(value).toBeOK();
    const updated = await value.json() as { estimatedValue: number | null };
    expect(updated.estimatedValue).toBe(22.5);
  });

  test('Rejects a Duplicate Discogs Release', async ({ request }) => {
    const response = await request.post(`${apiUrl}/api/cds`, {
      data: { artist: 'Duplicate Artist', title: 'Duplicate Album', discogsId },
    });
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'This exact Discogs release is already in your catalog.' });
  });

  test('Rejects an Incomplete Catalog Entry', async ({ request }) => {
    const response = await request.post(`${apiUrl}/api/cds`, { data: { title: 'Missing Artist' } });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Title and artist are required' });
  });

  test('Removes the Catalog Entry', async ({ request }) => {
    const deletion = await request.delete(`${apiUrl}/api/cds/${entryId}`);
    expect(deletion.status()).toBe(204);

    const search = await request.get(`${apiUrl}/api/cds?q=Stage%20Test%20Album&page=1&pageSize=12`);
    await expect(search).toBeOK();
    const payload = await search.json() as { total: number };
    expect(payload.total).toBe(0);
  });
});
