import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEbaySearchText } from './ebay';

test('cleanEbaySearchText removes Discogs suffixes and non-ASCII alternate names', () => {
  assert.equal(cleanEbaySearchText('Loudness (2) = ラウドネス'), 'Loudness');
  assert.equal(cleanEbaySearchText('Thunder in the East = サンダー・イン・ジ・イースト'), 'Thunder in the East');
  assert.equal(cleanEbaySearchText('Björk'), 'Bjork');
});
