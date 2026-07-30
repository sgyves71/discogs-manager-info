import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiscogsMarketStats } from './discogs-market-stats';

test('parseDiscogsMarketStats Extracts Release Statistics by Label', () => {
  const result = parseDiscogsMarketStats(`
    <section id="release-stats"><ul><li><span>Last Sold<!-- -->:</span><a><time datetime="2026-06-21">Jun 21, 2026</time></a></li>
    <li><span>Low<!-- -->:</span><span>$7.94</span></li><li><span>Median<!-- -->:</span><span>$17.61</span></li><li><span>High<!-- -->:</span><span>$37.50</span></li></ul></section>
  `);

  assert.equal(result.lastSoldAt?.toISOString(), '2026-06-21T00:00:00.000Z');
  assert.equal(result.low, 7.94);
  assert.equal(result.median, 17.61);
  assert.equal(result.high, 37.5);
  assert.equal(result.currency, 'USD');
});

test('parseDiscogsMarketStats Returns Nulls When Statistics Are Unavailable', () => {
  assert.deepEqual(parseDiscogsMarketStats('<main>No market statistics</main>'), {
    lastSoldAt: null, low: null, median: null, high: null, currency: null,
  });
});
