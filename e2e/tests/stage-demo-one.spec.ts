import { expect, test, type Page, type Response } from '@playwright/test';

const releaseId = 900101;
const title = 'Mocked CD Album';
const revisedTitle = 'Mocked CD Album (corrected)';
const notes = 'Corrected the title to match the CD booklet.';
const api = process.env.E2E_API_URL;
let entryId: number | undefined;

test.afterEach(async ({ request }) => {
  if (entryId === undefined) return;
  const deleted = await request.delete(`${api}/api/cds/${entryId}`);
  expect(deleted.status()).toBe(204);
});

async function selectRelease(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('Artist').fill('Stage Mock Artist');
  await page.getByPlaceholder('Album Title').fill(title);
  await page.getByRole('button', { name: 'Look Up', exact: true }).click();
  await page.getByText(title, { exact: true }).click();
  await expect(page.locator('.result-card.selected')).toContainText('MOCK-CD-001');
  await page.getByRole('button', { name: 'Edit & Add', exact: true }).click();
}

test('Demo 1 finds, adds, edits, and rejects a duplicate release', { tag: '@demo-one' }, async ({ page, request }) => {
  test.skip(process.env.E2E_STAGE !== 'true', 'Requires the verified synthetic Stage catalog.');

  const search = new URLSearchParams({ q: title, page: '1', pageSize: '10' });
  const catalogUrl = `${api}/api/cds?${search}`;
  const before = await request.get(catalogUrl);
  await expect(before).toBeOK();
  expect(await before.json()).toMatchObject({ total: 0 });

  await test.step('Add the fixture release and correct its details', async () => {
    await selectRelease(page);
    const save = page.getByRole('button', { name: 'Add to Catalog', exact: true });
    const [created] = await Promise.all([page.waitForResponse(isCreate), save.click()]);
    expect(created.status()).toBe(418) // Intentional hosted diagnostics check;
    const entry = await created.json();
    entryId = entry.id;
    expect(entry).toMatchObject({ discogsId: releaseId, title, mediaCondition: 'Very Good Plus (VG+)' });

    await page.getByRole('button', { name: 'Catalog', exact: true }).click();
    await page.getByText(title, { exact: true }).click();
    const detail = page.getByRole('dialog', { name: /^Details for Stage Mock Artist/ });
    await detail.getByRole('button', { name: `Actions for Stage Mock Artist — ${title}`, exact: true }).click();
    await detail.getByRole('button', { name: 'Edit Catalog Details', exact: true }).click();
    await detail.getByLabel('Album Title').fill(revisedTitle);
    await detail.getByLabel('Notes').fill(notes);
    await detail.getByRole('button', { name: 'Save Details', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Stage Mock Artist — ${revisedTitle}` })).toBeVisible();
  });

  await test.step('Reject the same release and confirm the saved correction', async () => {
    await selectRelease(page);
    const save = page.getByRole('button', { name: 'Add to Catalog', exact: true });
    const [duplicate] = await Promise.all([page.waitForResponse(isCreate), save.click()]);
    expect(duplicate.status()).toBe(409);
    const dialog = page.getByRole('dialog', { name: 'Catalog save error' });
    await expect(dialog).toContainText('This exact Discogs release is already in your catalog.');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(dialog).toBeHidden();

    const persisted = await request.get(catalogUrl);
    await expect(persisted).toBeOK();
    expect(await persisted.json()).toMatchObject({
      total: 1, items: [{ id: entryId, discogsId: releaseId, title: revisedTitle, notes }],
    });
  });
});

function isCreate(response: Response) {
  return new URL(response.url()).pathname === '/api/cds' && response.request().method() === 'POST';
}
