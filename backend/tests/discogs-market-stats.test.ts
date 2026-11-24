import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiscogsMarketStats, retainKnownDiscogsMarketStats } from '../src/discogs-market-stats.js';

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

// User-observed Discogs empty-state DOM, with the release-specific links removed.
const emptyStatistics = `
  <section id="release-stats" class="section_Odw8o open_FaEHZ">
    <header class="header_BgEm1"><h2>Statistics</h2></header>
    <div class="content_ETGfR"><div class="items_PQSxS">
      <ul>
        <li><span class="name_qjn4_">Have:</span><a>9</a></li>
        <li><span class="name_qjn4_">Want:</span><a>24</a></li>
        <li><span class="name_qjn4_">Avg Rating:</span><span>-- / 5</span></li>
        <li><span class="name_qjn4_">Ratings:</span><a>0</a></li>
      </ul>
      <ul>
        <li><span class="name_qjn4_">Last Sold:</span><span>Never</span></li>
        <li><span class="name_qjn4_">Low:</span><span>--</span></li>
        <li><span class="name_qjn4_">Median:</span><span>--</span></li>
        <li><span class="name_qjn4_">High:</span><span>--</span></li>
      </ul>
    </div></div>
  </section>
`;

test('parseDiscogsMarketStats accepts the observed Discogs no-sales markup', () => {
  assert.deepEqual(parseDiscogsMarketStats(emptyStatistics), {
    lastSoldAt: null, low: null, median: null, high: null, currency: null,
  });
});

test('parseDiscogsMarketStats rejects an unexpected page even if it was fetched successfully', () => {
  assert.throws(() => parseDiscogsMarketStats('<main>Request blocked</main>'), /statistics section was not found/);
  assert.throws(() => parseDiscogsMarketStats(emptyStatistics.replace('Median:', 'Typical:')), /missing the Median field/);
});

test('parseDiscogsMarketStats rejects changed value formats', () => {
  assert.throws(() => parseDiscogsMarketStats(emptyStatistics.replace('<span>--</span>', '<span>Unavailable for 3 regions</span>')), /market price format/);
  assert.throws(() => parseDiscogsMarketStats(emptyStatistics.replace('Never', '<time datetime="unknown">Unknown</time>')), /last-sold date/);
});

test('retainKnownDiscogsMarketStats Preserves Last Known Values When a Page Has No Statistics', () => {
  const result = retainKnownDiscogsMarketStats({
    lastSoldAt: new Date('2025-04-03'), low: 10, median: 20, high: 30, currency: 'USD',
  }, {
    lastSoldAt: null, low: null, median: null, high: null, currency: null,
  });

  assert.deepEqual(result, {
    lastSoldAt: new Date('2025-04-03'), low: 10, median: 20, high: 30, currency: 'USD',
  });
});
