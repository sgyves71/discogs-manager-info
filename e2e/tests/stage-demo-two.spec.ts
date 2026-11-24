import { expect, test } from '@playwright/test';

const release = {
  title: 'Stage Sync Recovery Album',
  artist: 'Stage Sync Artist',
  discogsId: 900199,
};
const api = process.env.E2E_API_URL;

test('Demo 2 reports a Discogs add timeout and recovers on retry', { tag: '@demo-two' }, async ({ page, request }) => {
  const catalogUrl = `${api}/api/cds`;
  const syncUrl = `${api}/api/discogs/collection-sync`;
  const readSync = async () => {
    const response = await request.get(syncUrl);
    await expect(response).toBeOK();
    return response.json();
  };
  const readRelease = async () => {
    const response = await request.get(catalogUrl, { params: { q: release.title } });
    await expect(response).toBeOK();
    return response.json();
  };

  expect(await readSync()).toMatchObject({ eligible: 2, pending: 2, sync: { status: 'idle' } });
  const created = await request.post(catalogUrl, { data: release });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  try {
    await test.step('Observe the timeout and verify the failed state was saved', async () => {
      const started = await request.post(syncUrl);
      expect(started.status()).toBe(202);
      await expect.poll(readSync).toMatchObject({
        pending: 1,
        sync: { status: 'complete', processed: 3, added: 2, failed: 1, error: 'Discogs took too long to respond.' },
      });
      expect(await readRelease()).toMatchObject({
        total: 1,
        items: [{ id, discogsId: release.discogsId, discogsCollectionSyncStatus: 'FAILED',
          discogsCollectionInstanceId: null, discogsCollectionSyncedAt: null }],
      });
    });

    await test.step('Retry from the UI and confirm the same release is synced', async () => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Music Library', exact: true }).click();
      const alert = page.getByRole('alert');
      await expect(alert).toContainText('Discogs took too long to respond.');
      await expect(alert).toContainText('Retry sync to check your Discogs collection and add missing releases.');

      const retry = page.getByRole('button', { name: 'Retry Discogs Sync', exact: true });
      page.once('dialog', (dialog) => dialog.accept());
      const [response] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === '/api/discogs/collection-sync' &&
          response.request().method() === 'POST'),
        retry.click(),
      ]);
      expect(response.status()).toBe(202);
      await expect(page.getByText(/Sync complete.*1 added.*2 already in Discogs.*0 failed/)).toBeVisible();
      await expect(alert).toHaveCount(0);
      expect(await readSync()).toMatchObject({ pending: 0, sync: { failed: 0, error: null } });
      expect(await readRelease()).toMatchObject({
        total: 1,
        items: [{ id, discogsId: release.discogsId, discogsCollectionSyncStatus: 'SYNCED',
          discogsCollectionInstanceId: release.discogsId, discogsCollectionSyncedAt: expect.any(String) }],
      });
    });

    await test.step('Reconcile again without adding another copy', async () => {
      const started = await request.post(syncUrl);
      expect(started.status()).toBe(202);
      await expect.poll(readSync).toMatchObject({
        pending: 0,
        sync: { status: 'complete', added: 0, alreadyInCollection: 3, failed: 0 },
      });
      expect(await readRelease()).toMatchObject({
        total: 1,
        items: [{ id, discogsCollectionSyncStatus: 'ALREADY_IN_COLLECTION', discogsCollectionInstanceId: release.discogsId }],
      });
    });
  } finally {
    const removed = await request.delete(`${catalogUrl}/${id}`);
    expect(removed.status()).toBe(204);
  }
});
