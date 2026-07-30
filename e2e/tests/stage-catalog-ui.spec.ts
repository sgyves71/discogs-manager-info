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
});
