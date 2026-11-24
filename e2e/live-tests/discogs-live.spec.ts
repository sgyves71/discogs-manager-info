import { expect, test } from '@playwright/test';

test('live-read Stage shows the mode in the browser', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Stage - Live Discogs search and release metadata')).toBeVisible();
});

test('Discogs finds a known CD pressing and returns its catalog metadata', async ({ request }) => {
  test.setTimeout(90_000);
  const barcode = process.env.STAGE_LIVE_BARCODE!;
  const releaseId = Number(process.env.STAGE_LIVE_RELEASE_ID);

  const search = await request.get('/api/discogs/search', {
    params: { barcode },
    maxRedirects: 0,
    timeout: 45_000,
  });
  await expect(search).toBeOK();
  expect(await search.json()).toEqual(expect.arrayContaining([expect.objectContaining({
    id: releaseId,
    format: expect.stringMatching(/\bCD\b/i),
  })]));

  const metadata = await request.get(`/api/discogs/releases/${releaseId}/catalog-info`, {
    maxRedirects: 0,
    timeout: 35_000,
  });
  await expect(metadata).toBeOK();
  const info = await metadata.json();
  expect(info).toMatchObject({
    label: expect.stringMatching(/\S/),
    catalogNumber: expect.stringMatching(/\S/),
    barcode: expect.any(String),
  });
  const barcodeForms = info.barcode.split(/[,·]/u).map((value: string) => value.replace(/\D/g, ''));
  expect(barcodeForms.map((value: string) => value.replace(/^0+/, ''))).toContain(barcode.replace(/^0+/, ''));
});
