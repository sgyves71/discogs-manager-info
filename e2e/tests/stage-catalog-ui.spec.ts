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

  test('Blocks Repeat Catalog Saves Until the First Save Completes', async ({ page }) => {
    let saveRequests = 0;
    await page.route('**/api/cds', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      saveRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        contentType: 'application/json',
        status: 201,
        body: JSON.stringify({ id: 501, artist: 'Stage Mock Artist', title: 'Mocked CD Album', estimatedValue: 15, hasCover: false }),
      });
    });

    await page.goto('/');
    await page.getByPlaceholder('Artist').fill('Stage Mock Artist');
    await page.getByPlaceholder('Album title').fill('Mocked CD Album');
    await page.getByRole('button', { name: 'Look up', exact: true }).click();
    await page.getByText('Mocked CD Album', { exact: true }).click();
    await page.getByRole('button', { name: 'Edit & Add', exact: true }).click();
    const saveButton = page.getByRole('button', { name: 'Add to Catalog', exact: true });
    await saveButton.click();
    await expect(page.getByRole('status')).toContainText('Saving catalog entry');
    await expect(saveButton).toBeDisabled();
    await expect(page.getByRole('status')).toBeHidden();
    expect(saveRequests).toBe(1);
  });

  test('Blocks Repeat Catalog Detail Updates Until the First Save Completes', async ({ page }) => {
    let updateRequests = 0;
    await page.route(/\/api\/cds\?.*/, (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          id: 42, artist: 'Stage Artist', title: 'Stage Album', year: 2001, country: 'US', label: 'Stage Records', format: 'CD, Album',
          catalogNumber: 'STAGE-001', barcode: '000000000001', mediaCondition: 'Very Good Plus (VG+)', estimatedValue: 15,
          notes: 'Synthetic Stage fixture. Safe to reset.', hasCover: false,
        }], total: 1, page: 1, pageSize: 24,
      }),
    }));
    await page.route(/\/api\/cds\/\d+\/details$/, async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      updateRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: 42, artist: 'Stage Artist', title: 'Stage Album', year: 2001, country: 'US', label: 'Stage Records', format: 'CD, Album',
          catalogNumber: 'STAGE-001', barcode: '000000000001', mediaCondition: 'Very Good Plus (VG+)', estimatedValue: 15,
          notes: 'Synthetic Stage fixture. Safe to reset.', hasCover: false,
        }),
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Catalog', exact: true }).click();
    await page.getByText('Stage Album', { exact: true }).click();
    await page.locator('.detail-action-menu summary').click();
    await page.getByRole('button', { name: 'Edit catalog details', exact: true }).click();
    const saveButton = page.getByRole('button', { name: 'Save details', exact: true });
    await saveButton.click();
    await expect(page.getByRole('status')).toContainText('Updating catalog details');
    await expect(saveButton).toBeDisabled();
    await expect(page.getByRole('status')).toBeHidden();
    expect(updateRequests).toBe(1);
  });
});
