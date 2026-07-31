import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicBrainzClient } from './musicbrainz.js';

test('MusicBrainzClient Returns Normalized Artist and Album Results', async () => {
  const requests: Array<{ url: string; config?: { params?: Record<string, unknown>; headers?: Record<string, unknown> } }> = [];
  const client = new MusicBrainzClient(async (url, config) => {
    requests.push({ url, config });
    if (url.endsWith('/artist')) {
      return { data: { artists: [{ id: 'artist-id', name: 'The Cure', 'sort-name': 'Cure, The', type: 'Group', country: 'GB', score: '100', 'life-span': { begin: '1978', ended: false } }] } } as never;
    }
    return { data: { 'release-groups': [{ id: 'album-id', title: 'Disintegration', 'primary-type': 'Album', 'secondary-types': ['Compilation'], 'first-release-date': '1989-05-02', score: 98, 'release-count': 12, 'artist-credit': [{ name: 'The Cure', artist: { id: 'artist-id', name: 'The Cure' } }] }] } } as never;
  }, 0, 'DiscogsManager Test/1.0');

  const results = await client.search({ artist: 'The Cure', album: 'Disintegration' });
  assert.deepEqual(results.artists, [{ id: 'artist-id', name: 'The Cure', sortName: 'Cure, The', disambiguation: null, type: 'Group', country: 'GB', score: 100, beginDate: '1978', endDate: null, ended: false }]);
  assert.deepEqual(results.releaseGroups, [{ id: 'album-id', title: 'Disintegration', primaryType: 'Album', secondaryTypes: ['Compilation'], firstReleaseDate: '1989-05-02', score: 98, releaseCount: 12, artistCredits: [{ id: 'artist-id', name: 'The Cure', joinPhrase: null }] }]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].config?.params?.query, 'The Cure');
  assert.equal(requests[1].config?.params?.query, 'artist:"The Cure" AND releasegroup:"Disintegration"');
  assert.equal(requests[1].config?.params?.fmt, 'json');
  assert.equal(requests[0].config?.headers?.['User-Agent'], 'DiscogsManager Test/1.0');
});

test('MusicBrainzClient Searches an Album Without Requiring an Artist', async () => {
  const requests: Array<{ url: string; config?: { params?: Record<string, unknown> } }> = [];
  const client = new MusicBrainzClient(async (url, config) => {
    requests.push({ url, config });
    return { data: { 'release-groups': [] } } as never;
  }, 0);

  const results = await client.search({ album: 'Master of Puppets' });
  assert.deepEqual(results, { artists: [], releaseGroups: [] });
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.endsWith('/release-group'));
  assert.equal(requests[0].config?.params?.query, 'releasegroup:"Master of Puppets"');
});

test('MusicBrainzClient Avoids Requests for Empty Search Criteria', async () => {
  let requests = 0;
  const client = new MusicBrainzClient(async () => {
    requests += 1;
    return { data: {} } as never;
  }, 0);
  assert.deepEqual(await client.search({ artist: '   ', album: '' }), { artists: [], releaseGroups: [] });
  assert.equal(requests, 0);
});

test('MusicBrainzClient Uses Exact Artist and Album Matches for Context Details', async () => {
  const requests: string[] = [];
  const client = new MusicBrainzClient(async (url) => {
    requests.push(url);
    if (url.endsWith('/artist')) return { data: { artists: [{ id: 'artist-id', name: 'Icon', type: 'Group', country: 'US', score: 100, 'life-span': { begin: '1979' } }] } } as never;
    if (url.endsWith('/release-group')) return { data: { 'release-groups': [{ id: 'group-id', title: 'Night Of The Crime', 'primary-type': 'Album', 'first-release-date': '1985', score: 100, 'artist-credit': [{ name: 'Icon', artist: { id: 'artist-id', name: 'Icon' } }] }] } } as never;
    if (url.endsWith('/artist/artist-id')) return { data: { annotation: 'Artist annotation', genres: [{ name: 'Hard rock' }], tags: [{ name: 'glam metal' }] } } as never;
    return { data: { annotation: 'Album annotation', genres: [{ name: 'Heavy metal' }], tags: [{ name: '1980s' }] } } as never;
  }, 0);

  const context = await client.getCatalogContext({ artist: 'Icon', album: 'Night Of The Crime' });
  assert.deepEqual(context, {
    artist: { id: 'artist-id', name: 'Icon', type: 'Group', country: 'US', disambiguation: null, beginDate: '1979', endDate: null, ended: null, annotation: 'Artist annotation', genres: ['Hard rock'], tags: ['glam metal'] },
    releaseGroup: { id: 'group-id', title: 'Night Of The Crime', primaryType: 'Album', firstReleaseDate: '1985', annotation: 'Album annotation', genres: ['Heavy metal'], tags: ['1980s'] },
  });
  assert.deepEqual(requests.map((url) => url.replace('https://musicbrainz.org/ws/2', '')), ['/artist', '/release-group', '/artist/artist-id', '/release-group/group-id']);
});
