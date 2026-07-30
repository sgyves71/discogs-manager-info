import { expect, test } from '@playwright/test';

test('catalog API returns a paginated collection envelope', async ({ request }) => {
  const response = await request.get(`${process.env.E2E_API_URL || 'http://localhost:3100'}/api/cds?page=1&pageSize=12`);
  await expect(response).toBeOK();
  const payload = await response.json() as { items?: unknown[]; total?: number; page?: number; pageSize?: number };
  expect(Array.isArray(payload.items)).toBe(true);
  expect(payload.page).toBe(1);
  expect(payload.pageSize).toBe(12);
  expect(typeof payload.total).toBe('number');
});
