import { expect, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://localhost:3100';
const isStage = process.env.E2E_STAGE === 'true';

test.describe('Stage Discogs Mock', () => {
  test.skip(!isStage, 'Discogs mock coverage runs only against the disposable Stage server.');

  test('Returns Stable CD Search and Release Data', async ({ request }) => {
    const search = await request.get(`${apiUrl}/api/discogs/search?artist=Stage%20Mock%20Artist&title=Mocked%20CD%20Album`);
    await expect(search).toBeOK();
    const results = await search.json() as Array<{ id: number; artist: string; title: string; format: string; catalogNumber: string | null }>;
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ id: 900101, artist: 'Stage Mock Artist', title: 'Mocked CD Album', format: 'CD, Album', catalogNumber: 'SEARCH-PLACEHOLDER' });

    const [catalogInfo, context, tracklist] = await Promise.all([
      request.get(`${apiUrl}/api/discogs/releases/900101/catalog-info`),
      request.get(`${apiUrl}/api/discogs/releases/900101/context`),
      request.get(`${apiUrl}/api/discogs/releases/900101/tracklist`),
    ]);
    await expect(catalogInfo).toBeOK();
    await expect(context).toBeOK();
    await expect(tracklist).toBeOK();
    expect(await catalogInfo.json()).toMatchObject({ label: 'Mock Records', catalogNumber: 'MOCK-CD-001', barcode: expect.stringContaining('0123456789012') });
    expect(await context.json()).toMatchObject({ genre: 'Rock', style: 'Hard Rock', descriptionSource: 'release' });
    expect(await tracklist.json()).toMatchObject({ tracks: [expect.objectContaining({ title: 'Stage Song One' }), expect.objectContaining({ title: 'Stage Song Two' })] });
  });

  test('Returns No Results for an Unrecognized Search', async ({ request }) => {
    const response = await request.get(`${apiUrl}/api/discogs/search?artist=Unrecognized%20Stage%20Artist`);
    await expect(response).toBeOK();
    expect(await response.json()).toEqual([]);
  });

  test('Returns Stable Cover Art for a Stage Release', async ({ request }) => {
    const response = await request.get(`${apiUrl}/api/discogs/releases/900101/cover`);
    await expect(response).toBeOK();
    expect(await response.json()).toMatchObject({ coverImage: expect.stringContaining('data:image/svg+xml') });
  });

  test('Offers Voice Entry for a Catalog Number', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Speak Catalog Number' })).toBeVisible();
  });

  test('Searches and Selects a Mock Discogs Release in the User Interface', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Artist').fill('Stage Mock Artist');
    await page.getByPlaceholder('Album Title').fill('Mocked CD Album');
    await page.getByRole('button', { name: 'Look Up', exact: true }).click();

    await expect(page.getByText('Mocked CD Album', { exact: true })).toBeVisible();
    await page.getByText('Mocked CD Album', { exact: true }).click();
    const selectedResult = page.locator('.result-card.selected');
    await expect(selectedResult).toContainText('Mock Records');
    await expect(selectedResult).toContainText('MOCK-CD-001');
    await expect(selectedResult).toContainText('Rock');
    await expect(selectedResult).toContainText('Hard Rock');
    await expect(selectedResult).toContainText(/synthetic CD release supplies stable label/i);
    await expect(page.getByText(/synthetic artist used only for repeatable automated testing/i)).toHaveCount(0);
  });

  test('Filters Search Results by Country When Multiple Countries Are Available', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Artist').fill('Stage Mock Artist');
    await page.getByPlaceholder('Album Title').fill('Mocked CD Album');
    await page.getByRole('button', { name: 'Look Up', exact: true }).click();

    const countryFilter = page.getByRole('combobox', { name: 'Filter search results by country' });
    await expect(countryFilter).toBeEnabled();
    await expect(countryFilter).toHaveText(/US/);
    await expect(countryFilter).toHaveText(/UK/);
    await countryFilter.selectOption('UK');
    await expect(page.getByText('Mocked CD Album (Reissue)', { exact: true })).toBeVisible();
    await expect(page.getByText('Mocked CD Album', { exact: true })).toBeHidden();
  });

  test('Clears Search Inputs and Results', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Artist').fill('Stage Mock Artist');
    await page.getByPlaceholder('Album Title').fill('Mocked CD Album');
    await page.getByPlaceholder('Catalog Number').fill('SEARCH-PLACEHOLDER');
    await page.getByPlaceholder('Barcode').fill('0123456789012');
    await page.getByRole('button', { name: 'Look Up', exact: true }).click();
    await expect(page.getByText('Mocked CD Album', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByPlaceholder('Artist')).toHaveValue('');
    await expect(page.getByPlaceholder('Album Title')).toHaveValue('');
    await expect(page.getByPlaceholder('Catalog Number')).toHaveValue('');
    await expect(page.getByPlaceholder('Barcode')).toHaveValue('');
    await expect(page.getByText('Mocked CD Album', { exact: true })).toBeHidden();
  });

  test('Keeps Barcode Scanning Available While Selected Release Data Loads', async ({ page }) => {
    await page.route(/\/api\/discogs\/releases\/900101\/catalog-info$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ label: 'Mock Records', catalogNumber: 'MOCK-CD-001', barcode: '0123456789012' }) });
    });

    await page.goto('/');
    await page.getByPlaceholder('Artist').fill('Stage Mock Artist');
    await page.getByPlaceholder('Album Title').fill('Mocked CD Album');
    await page.getByRole('button', { name: 'Look Up', exact: true }).click();
    await page.getByText('Mocked CD Album', { exact: true }).click();

    await expect(page.locator('.app-layout')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('button', { name: 'Scan Barcode', exact: true })).toBeEnabled();
  });

  test('Skips eBay Values When the Search Toggle Is Off', async ({ page }) => {
    let ebayRequests = 0;
    await page.route('**/api/ebay/active-listing-stats?**', async (route) => {
      ebayRequests += 1;
      await route.fallback();
    });

    await page.goto('/');
    await page.getByLabel('Include Current eBay Auction Values').uncheck();
    await page.getByLabel('Include Discogs Market Statistics').uncheck();
    await page.getByPlaceholder('Artist').fill('Stage Mock Artist');
    await page.getByPlaceholder('Album Title').fill('Mocked CD Album');
    await page.getByRole('button', { name: 'Look Up', exact: true }).click();
    await page.getByText('Mocked CD Album', { exact: true }).click();
    await expect(page.locator('.result-card.selected')).toContainText('Mock Records');
    expect(ebayRequests).toBe(0);
    await expect(page.locator('.price-suggestions')).toHaveCount(0);
  });

  test('Reuses Loaded Search Release Details When a Card Is Selected Again', async ({ page }) => {
    let catalogInfoRequests = 0;
    await page.route('**/api/discogs/releases/900101/catalog-info', async (route) => {
      catalogInfoRequests += 1;
      await route.fallback();
    });

    await page.goto('/');
    await page.getByPlaceholder('Artist').fill('Stage Mock Artist');
    await page.getByPlaceholder('Album Title').fill('Mocked CD Album');
    await page.getByRole('button', { name: 'Look Up', exact: true }).click();
    await page.getByText('Mocked CD Album', { exact: true }).click();
    await expect(page.locator('.result-card.selected')).toContainText('Mock Records');

    await page.getByText('Mocked CD Album (Reissue)', { exact: true }).click();
    await expect(page.locator('.result-card.selected')).toContainText('Mocked CD Album (Reissue)');
    await page.getByText('Mocked CD Album', { exact: true }).click();
    await expect(page.locator('.result-card.selected')).toContainText('Mock Records');
    expect(catalogInfoRequests).toBe(1);
  });
});
