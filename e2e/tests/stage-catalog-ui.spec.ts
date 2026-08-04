import { expect, test } from '@playwright/test';

const isStage = process.env.E2E_STAGE === 'true';

test.describe('Stage Catalog User Interface', () => {
  test.skip(!isStage, 'Catalog UI fixture coverage runs only against the disposable Stage database.');

  test('Filters the Catalog by Artist Name', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Catalog', exact: true }).click();

    const search = page.getByRole('textbox', { name: 'Search Collection' });
    await search.fill('Stage Artist');
    await expect(page.getByText('Stage Artist', { exact: true })).toBeVisible();
    await expect(page.getByText('Stage Album', { exact: true })).toBeVisible();
    await expect(page.getByText('Showing 1 of 1')).toBeVisible();
  });

  test('Requests Discogs Median Sorting for the Catalog', async ({ page }) => {
    const sorts: string[] = [];
    await page.route(/\/api\/cds\?.*/, async (route) => {
      sorts.push(new URL(route.request().url()).searchParams.get('sort') || '');
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }) });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Catalog', exact: true }).click();
    await page.getByRole('combobox', { name: 'Sort Catalog' }).selectOption('discogs-median-desc');
    await expect.poll(() => sorts.includes('discogs-median-desc')).toBe(true);
    await expect(page.getByText('Discogs Median', { exact: true })).toBeVisible();
  });

  test('Keeps Discogs Median Sorting in Cover Grid View', async ({ page }) => {
    const albums = [
      { id: 1, artist: 'Lower Value Artist', title: 'Lower Value Album', year: 2000, format: 'CD', estimatedValue: 15, discogsMarketMedian: 10, hasCover: false },
      { id: 2, artist: 'Higher Value Artist', title: 'Higher Value Album', year: 2001, format: 'CD', estimatedValue: 15, discogsMarketMedian: 50, hasCover: false },
    ];
    await page.route(/\/api\/cds\?.*/, async (route) => {
      const sort = new URL(route.request().url()).searchParams.get('sort');
      const items = sort === 'discogs-median-desc' ? [...albums].reverse() : albums;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items, total: items.length, page: 1, pageSize: 50 }) });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Catalog', exact: true }).click();
    await page.getByRole('button', { name: 'Cover Grid', exact: true }).click();
    await page.getByRole('combobox', { name: 'Sort Catalog' }).selectOption('discogs-median-desc');
    await expect(page.locator('.catalog-cover-grid-caption strong')).toHaveText(['Higher Value Artist', 'Lower Value Artist']);
  });

  test('Displays Catalog Value Statistics', async ({ page }) => {
    await page.route('/api/catalog/statistics', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        totalEntries: 100,
        discogsMedian: { count: 72, total: 1834.5 },
        estimatedValue: { count: 100, total: 2100 },
        styles: [{ style: 'Heavy Metal', count: 78, percentage: 78 }, { style: 'Hard Rock', count: 22, percentage: 22 }],
      }),
    }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Catalog Statistics', exact: true }).click();
    await expect(page.getByText('Catalog Entries', { exact: true })).toBeVisible();
    await expect(page.getByText('$1,834.50', { exact: true })).toBeVisible();
    await expect(page.getByText('72 releases with a known Discogs median', { exact: true })).toBeVisible();
    await expect(page.getByText('$2,100.00', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Style distribution bar chart' })).toBeVisible();
    await expect(page.getByText('Heavy Metal', { exact: true })).toBeVisible();
    await expect(page.getByText('78.0% · 78 CDs', { exact: true })).toBeVisible();
  });

  test('Warns Before Starting a Valuation Update', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Music Library', exact: true }).click();
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('may take around 30 minutes');
      void dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Update Valuations', exact: true }).click();
  });

  test('Synchronizes the Stage Catalog to the Stage Discogs Collection', async ({ request }) => {
    const preview = await request.get(`${process.env.E2E_API_URL || 'http://localhost:3100'}/api/discogs/collection-sync`);
    await expect(preview).toBeOK();
    expect(await preview.json()).toMatchObject({ configured: true, eligible: 1, pending: 1 });

    const start = await request.post(`${process.env.E2E_API_URL || 'http://localhost:3100'}/api/discogs/collection-sync`);
    expect(start.status()).toBe(202);

    await expect.poll(async () => {
      const response = await request.get(`${process.env.E2E_API_URL || 'http://localhost:3100'}/api/discogs/collection-sync`);
      return (await response.json() as { sync: { status: string } }).sync.status;
    }).toBe('complete');

    const completed = await request.get(`${process.env.E2E_API_URL || 'http://localhost:3100'}/api/discogs/collection-sync`);
    expect(await completed.json()).toMatchObject({ sync: { status: 'complete', added: 1, username: 'stage-discogs-user' } });
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

  test('Switches Between List and Cover Grid Views', async ({ page }) => {
    await page.route(/\/api\/cds\?.*/, (route) => route.fulfill({
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
    await page.getByRole('button', { name: 'Cover Grid', exact: true }).click();
    await expect(page.locator('.catalog-cover-grid')).toBeVisible();
    await expect(page.locator('.catalog-cover-grid-image img')).toHaveAttribute('src', '/api/cds/42/cover?updated=2026-07-30T19%3A00%3A00.000Z');
    await expect(page.locator('.catalog-cover-grid-caption')).toContainText('Cover Test Artist');
    await expect(page.locator('.catalog-cover-grid-caption')).toContainText('Cover Test Album');

    await page.getByRole('button', { name: 'List View', exact: true }).click();
    await expect(page.locator('.collection-list')).toBeVisible();
  });

  test('Shows a Compact Two-Column Cover Grid on Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Catalog' }).click();
    const gridButton = page.getByRole('button', { name: 'Cover Grid', exact: true });
    await expect(gridButton).toBeVisible();
    await gridButton.click();
    await expect(page.locator('.catalog-cover-grid')).toBeVisible();
    await expect(page.locator('.catalog-cover-grid-item')).toHaveCount(1);
  });

  test('Loads More Catalog Albums When the Scroll Sentinel Is Reached', async ({ page }) => {
    const catalogItems = Array.from({ length: 51 }, (_, index) => ({
      id: index + 1, artist: `Scroll Artist ${index + 1}`, title: `Scroll Album ${index + 1}`, year: 2000 + index, country: 'US', label: 'Test Records', format: 'CD, Album',
      estimatedValue: null, notes: null, discogsId: 910000 + index, discogsUri: `/release/${910000 + index}`, catalogNumber: `SCROLL-${index + 1}`, barcode: null,
      mediaCondition: 'Very Good Plus (VG+)', valueLastCheckedAt: null, hasCover: false,
    }));
    await page.route(/\/api\/cds\?.*/, (route) => {
      const requestedPage = Number(new URL(route.request().url()).searchParams.get('page'));
      const start = (requestedPage - 1) * 50;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: catalogItems.slice(start, start + 50), total: catalogItems.length, page: requestedPage, pageSize: 50 }) });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Catalog', exact: true }).click();
    await expect(page.getByText('Scroll Album 1', { exact: true })).toBeVisible();
    const nextBatchRequest = page.waitForRequest((request) => request.url().includes('/api/cds?') && request.url().includes('page=2'));
    await page.getByTestId('collection-load-more-sentinel').scrollIntoViewIfNeeded();
    await nextBatchRequest;
    await expect(page.getByText('Scroll Album 51', { exact: true })).toBeVisible();
  });

  test('Shows No Recent Sales When a Checked Release Has No Market Values', async ({ page }) => {
    await page.route(/\/api\/cds\?.*/, (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          id: 73, artist: 'No Sale Data Artist', title: 'No Sale Data Album', year: 2001, country: 'US', label: 'Stage Records', format: 'CD, Album',
          catalogNumber: 'NO-SALES-001', barcode: null, mediaCondition: 'Very Good Plus (VG+)', estimatedValue: 15,
          notes: null, hasCover: false, discogsId: 900073, discogsUri: '/release/900073',
          discogsLastSoldAt: null, discogsMarketLow: null, discogsMarketMedian: null, discogsMarketHigh: null,
          discogsMarketCurrency: null, discogsMarketStatsCheckedAt: null,
        }], total: 1, page: 1, pageSize: 24,
      }),
    }));

    await page.goto('/');
    await page.getByRole('button', { name: 'Catalog', exact: true }).click();
    await page.getByText('No Sale Data Album', { exact: true }).click();
    await expect(page.getByText('No recent sale detail found.', { exact: true })).toBeVisible();
  });

  test('Closes the Catalog Details Menu When the Pointer Leaves It', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Catalog', exact: true }).click();
    await page.getByText('Stage Album', { exact: true }).click();
    const menu = page.locator('.detail-action-menu');
    await menu.locator('summary').click();
    await expect(menu).toHaveAttribute('open', '');
    await menu.locator('.detail-action-menu-items').hover();
    await expect(menu).toHaveAttribute('open', '');
    await menu.hover();
    await page.locator('.collection-detail-header').hover({ position: { x: 20, y: 20 } });
    await expect(menu).not.toHaveAttribute('open', '');
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
    await page.getByPlaceholder('Album Title').fill('Mocked CD Album');
    await page.getByRole('button', { name: 'Look Up', exact: true }).click();
    await page.getByText('Mocked CD Album', { exact: true }).click();
    await page.getByRole('button', { name: 'Edit & Add', exact: true }).click();
    const saveButton = page.getByRole('button', { name: 'Add to Catalog', exact: true });
    await saveButton.click();
    await expect(page.getByRole('status')).toContainText('Saving catalog entry');
    await expect(saveButton).toBeDisabled();
    await expect(page.getByRole('status')).toBeHidden();
    expect(saveRequests).toBe(1);
  });

  test('Shows a Save Error Dialog for a Duplicate Discogs Release', async ({ page }) => {
    await page.route('**/api/cds', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({ contentType: 'application/json', status: 409, body: JSON.stringify({ error: 'This exact Discogs release is already in your catalog.' }) });
    });

    await page.goto('/');
    await page.getByPlaceholder('Artist').fill('Stage Mock Artist');
    await page.getByPlaceholder('Album Title').fill('Mocked CD Album');
    await page.getByRole('button', { name: 'Look Up', exact: true }).click();
    await page.getByText('Mocked CD Album', { exact: true }).click();
    await page.getByRole('button', { name: 'Edit & Add', exact: true }).click();
    await page.getByRole('button', { name: 'Add to Catalog', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Catalog save error' });
    await expect(dialog).toContainText('This exact Discogs release is already in your catalog.');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(dialog).toBeHidden();
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
    await page.getByRole('button', { name: 'Edit Catalog Details', exact: true }).click();
    const saveButton = page.getByRole('button', { name: 'Save Details', exact: true });
    await saveButton.click();
    await expect(page.getByRole('status')).toContainText('Updating catalog details');
    await expect(saveButton).toBeDisabled();
    await expect(page.getByRole('status')).toBeHidden();
    expect(updateRequests).toBe(1);
  });
});
