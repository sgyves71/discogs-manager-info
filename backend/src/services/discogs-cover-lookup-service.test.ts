import test from 'node:test';
import assert from 'node:assert/strict';
import { DiscogsCoverLookupService } from './discogs-cover-lookup-service.js';

test('DiscogsCoverLookupService Shares Concurrent Lookups and Caches Results', async () => {
  let requests = 0;
  let resolveCover: ((value: string | null) => void) | undefined;
  const service = new DiscogsCoverLookupService(async () => {
    requests += 1;
    return new Promise((resolve) => { resolveCover = resolve; });
  });

  const first = service.getCover(123);
  const second = service.getCover(123);
  assert.equal(requests, 1);
  resolveCover?.('https://images.example/cover.jpg');
  assert.equal(await first, 'https://images.example/cover.jpg');
  assert.equal(await second, 'https://images.example/cover.jpg');
  assert.equal(await service.getCover(123), 'https://images.example/cover.jpg');
  assert.equal(requests, 1);
});

test('DiscogsCoverLookupService Does Not Cache Failed Lookups', async () => {
  let requests = 0;
  const service = new DiscogsCoverLookupService(async () => {
    requests += 1;
    if (requests === 1) throw new Error('Temporary Discogs error');
    return null;
  });

  await assert.rejects(() => service.getCover(456), /Temporary Discogs error/);
  assert.equal(await service.getCover(456), null);
  assert.equal(requests, 2);
});
