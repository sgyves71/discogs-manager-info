import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDiscogsText, getDiscogsPriceSuggestion, getDiscogsReleaseCatalogInfo, normalizeDiscogsResult, searchDiscogsReleases, stripDiscogsArtistDisambiguator } from './discogs.js';

test('normalizeDiscogsResult Builds a Clean Release Summary', () => {
  const result = normalizeDiscogsResult({
    id: 123,
    title: 'Artist - Album',
    artist: 'Artist',
    year: '1999',
    country: 'US',
    label: 'Label',
    format: ['CD', 'Album'],
    uri: '/release/123',
    thumb: 'thumb.jpg',
    cover_image: 'cover.jpg',
    catno: '123-ABC',
    barcode: ['0123456789012'],
    lowest_price: '12.99',
  });

  assert.equal(result.id, 123);
  assert.equal(result.title, 'Album');
  assert.equal(result.artist, 'Artist');
  assert.equal(result.year, 1999);
  assert.equal(result.country, 'US');
  assert.equal(result.label, 'Label');
  assert.equal(result.format, 'CD, Album');
  assert.equal(result.coverImage, 'cover.jpg');
  assert.equal(result.catalogNumber, '123-ABC');
  assert.equal(result.barcode, '0123456789012');
  assert.equal(result.lowestPrice, 12.99);
});

test('searchDiscogsReleases Returns an Empty List When the Request Times Out', async () => {
  const results = await searchDiscogsReleases('Pink Floyd', undefined, async () => {
    throw new Error('timeout');
  });

  assert.deepEqual(results, []);
});

test('searchDiscogsReleases Includes CD, DVD, and Box Set Database Searches', async () => {
  const requestParams: Record<string, unknown>[] = [];

  await searchDiscogsReleases('The Cure Disintegration', undefined, async (_url, config) => {
    requestParams.push(config?.params as Record<string, unknown>);
    return { data: { results: [] } } as never;
  });

  assert.deepEqual(requestParams.map((params) => params.format).sort(), ['Box Set', 'CD', 'DVD']);
  assert.ok(requestParams.every((params) => params.type === 'release'));
  assert.ok(requestParams.every((params) => params.per_page === 100));
});

test('searchDiscogsReleases Combines CD, DVD, and Box Set Results', async () => {
  const results = await searchDiscogsReleases('Live Performance', undefined, async (_url, config) => {
    const format = (config?.params as Record<string, unknown>)?.format;
    return {
      data: {
        results: format === 'CD'
          ? [{ id: 101, title: 'Test Artist - Live Performance', format: ['CD'], year: 2001 }]
          : format === 'DVD'
            ? [{ id: 202, title: 'Test Artist - Live Performance', format: ['DVD'], year: 2002 }]
            : [{ id: 303, title: 'Test Artist - Live Performance', format: ['Box Set'], year: 2003 }],
      },
    } as never;
  });

  assert.deepEqual(results.map((result) => ({ id: result.id, format: result.format })), [
    { id: 101, format: 'CD' },
    { id: 202, format: 'DVD' },
    { id: 303, format: 'Box Set' },
  ]);
});

test('searchDiscogsReleases Passes Artist and Album Title as Dedicated Filters', async () => {
  const requestParams: Record<string, unknown>[] = [];

  await searchDiscogsReleases('', undefined, async (_url, config) => {
    requestParams.push(config?.params as Record<string, unknown>);
    return { data: { results: [] } } as never;
  }, 'Riot', 'Thundersteel');

  assert.ok(requestParams.every((params) => params.artist === 'Riot'));
  assert.ok(requestParams.every((params) => params.release_title === 'Thundersteel'));
  assert.ok(requestParams.every((params) => params.q === undefined));
});

test('searchDiscogsReleases Passes Catalog Number and Barcode Filters', async () => {
  const requestParams: Record<string, unknown>[] = [];

  await searchDiscogsReleases('', undefined, async (_url, config) => {
    requestParams.push(config?.params as Record<string, unknown>);
    return { data: { results: [] } } as never;
  }, undefined, undefined, '3984-15417-2', '039841541724');

  assert.ok(requestParams.every((params) => params.catno === '3984-15417-2'));
  assert.ok(requestParams.every((params) => params.barcode === '039841541724'));
});

test('getDiscogsPriceSuggestion Returns the Selected Condition Value', async () => {
  const suggestion = await getDiscogsPriceSuggestion(123, 'Very Good Plus (VG+)', undefined, async () => (
    { data: { 'Very Good Plus (VG+)': { value: 24.5, currency: 'USD' } } } as never
  ));

  assert.deepEqual(suggestion, { value: 24.5, currency: 'USD' });
});

test('normalizeDiscogsResult Derives the Artist From a Database-Search Title', () => {
  const result = normalizeDiscogsResult({
    id: 789,
    title: 'The Cure - Disintegration',
  });

  assert.equal(result.artist, 'The Cure');
  assert.equal(result.title, 'Disintegration');
});

test('normalizeDiscogsResult Removes Discogs Artist Disambiguator Suffixes', () => {
  const result = normalizeDiscogsResult({
    id: 790,
    title: 'Obsession (6) - Scarred For Life',
  });

  assert.equal(result.artist, 'Obsession');
  assert.equal(stripDiscogsArtistDisambiguator('Iron Maiden (2)'), 'Iron Maiden');
});

test('cleanDiscogsText Keeps Latin Letters and Numbers While Removing Non-Language Noise', () => {
  assert.equal(cleanDiscogsText('Beyonc\u00e9 \u2014 R\u00e9sum\u00e9 2 \ud83c\udfb5 \u65e5\u672c\u8a9e'), 'Beyonc\u00e9 - R\u00e9sum\u00e9 2');
  assert.equal(stripDiscogsArtistDisambiguator('Iron Maiden (2) \u65e5\u672c\u8a9e'), 'Iron Maiden');
});

test('getDiscogsReleaseCatalogInfo Uses Release Labels and Excludes Companies', async () => {
  const info = await getDiscogsReleaseCatalogInfo(123, undefined, async () => ({
    data: {
      labels: [
        { name: 'Columbia', catno: '69699-80202-2' },
        { name: 'Albert Productions', catno: '69699-80202-2' },
      ],
      identifiers: [
        { type: 'Barcode (Text)', value: '0 035627 472022' },
        { type: 'Barcode (Scanned)', value: '0035627472022' },
        { type: 'Matrix / Runout', value: 'SONOPRESS D-5279' },
        { type: 'Rights Society', value: 'BIEM' },
      ],
    },
  } as never));

  assert.deepEqual(info, {
    label: 'Columbia, Albert Productions',
    catalogNumber: '69699-80202-2',
    barcode: '(Text): 0 035627 472022 · (Scanned): 0035627472022',
  });
});

test('normalizeDiscogsResult Handles Non-String Label and Country Values', () => {
  const result = normalizeDiscogsResult({
    id: 456,
    title: 'Artist - Album',
    artist: 'Artist',
    year: '1999',
    country: { name: 'US' } as unknown as string,
    label: [{ name: 'Label A' }, { name: 'Label B' }] as unknown as string,
    format: ['CD', 'Album'],
    uri: '/release/456',
    thumb: 'thumb.jpg',
    lowest_price: '10.50',
  });

  assert.equal(result.country, 'US');
  assert.equal(result.label, 'Label A, Label B');
});
