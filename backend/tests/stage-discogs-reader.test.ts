import axios, { type AxiosAdapter } from 'axios';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createStageDiscogsReader } from '../src/stage-discogs-reader.js';

test('live-read requires a separate well-formed credential', () => {
  for (const token of [undefined, ' ', 'two words']) {
    assert.throws(() => createStageDiscogsReader(token), /STAGE_DISCOGS_READ_TOKEN/);
  }
});

test('live-read uses only official GETs and distinguishes empty results from failure', async () => {
  const urls: string[] = [];
  let searchResults: unknown = [];
  const adapter: AxiosAdapter = async (config) => {
    assert.equal(config.method, 'get');
    assert.equal(config.maxRedirects, 0);
    assert.equal(config.headers.get('Authorization'), 'Discogs token=stage-test');
    assert.ok(config.url);
    urls.push(config.url);
    const data = config.url.endsWith('/database/search')
      ? { results: searchResults }
      : { labels: [{ name: 'Example Records', catno: 'EX-42' }] };
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  const originalAdapter = axios.defaults.adapter;
  axios.defaults.adapter = adapter;
  const reader = createStageDiscogsReader('stage-test');
  axios.defaults.adapter = originalAdapter;

  const input = { query: '', artist: '', releaseTitle: '', catalogNumber: '', barcode: '0123456789012' };
  assert.deepEqual(await reader.search(input), []);
  assert.equal((await reader.catalogInfo(42)).catalogNumber, 'EX-42');
  searchResults = undefined;
  await assert.rejects(reader.search(input), /unexpected search response/);
  assert.deepEqual(new Set(urls), new Set([
    'https://api.discogs.com/database/search',
    'https://api.discogs.com/releases/42',
  ]));
});
