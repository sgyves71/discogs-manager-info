import { expect, test } from '@playwright/test';

const isStage = process.env.E2E_STAGE === 'true';

test.describe('Stage Catalog User Interface', () => {
  test.skip(!isStage, 'Catalog UI fixture coverage runs only against the disposable Stage database.');

  test('Filters the Catalog by Artist Name', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Catalog', exact: true }).click();

    const search = page.getByRole('textbox', { name: 'Search collection' });
    await search.fill('Stage Artist');
    await expect(page.getByText('Stage Artist', { exact: true })).toBeVisible();
    await expect(page.getByText('Stage Album', { exact: true })).toBeVisible();
    await expect(page.getByText('Showing 1–1 of 1')).toBeVisible();
  });

  test('Warns Before Starting a Valuation Update', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Music Library', exact: true }).click();
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('may take around 30 minutes');
      void dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Update valuations', exact: true }).click();
  });

  test('Versions a Catalog Cover URL After a Cover Update', async ({ page }) => {
    await page.route(/\/api\/cds\?/, (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          id: 42, artist: 'Cover Test Artist', title: 'Cover Test Album', year: 2001, country: 'US', label: 'Test Records', format: 'CD, Album',
          estimatedValue: null, notes: null, discogsId: 900101, discogsUri: '/release/900101', catalogNumber: 'TEST-42', barcode: null,
          mediaCondition: 'Very Good Plus (VG+)', valueLastCheckedAt: null, hasCover: true, coverImageUpdatedAt: '2026-07-30T19:00:00.000Z',
        }], total: 1, page: 1, pageSize: 24,
      }),
    }));

    await page.goto('/');
    await page.getByRole('button', { name: 'Catalog', exact: true }).click();
    await expect(page.locator('.collection-cover img')).toHaveAttribute('src', '/api/cds/42/cover?updated=2026-07-30T19%3A00%3A00.000Z');
  });
});
