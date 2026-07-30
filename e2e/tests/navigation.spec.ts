import { expect, test } from '@playwright/test';

test('can navigate between Search, Catalog, and Music Library', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Search & Scan' })).toBeVisible();

  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Catalog', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Music Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Music Library', exact: true })).toBeVisible();
});
