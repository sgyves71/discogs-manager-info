import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEbaySearchText, isMatchingCdAudioListing } from './ebay';

test('cleanEbaySearchText Removes Discogs Suffixes and Non-ASCII Alternate Names', () => {
  assert.equal(cleanEbaySearchText('Loudness (2) = ラウドネス'), 'Loudness');
  assert.equal(cleanEbaySearchText('Thunder in the East = サンダー・イン・ジ・イースト'), 'Thunder in the East');
  assert.equal(cleanEbaySearchText('Björk'), 'Bjork');
});

test('isMatchingCdAudioListing Excludes Signed Listings', () => {
  assert.equal(isMatchingCdAudioListing('Signed Iron Maiden - Killers CD', 'Iron Maiden', 'Killers'), false);
  assert.equal(isMatchingCdAudioListing('Iron Maiden - Killers CD', 'Iron Maiden', 'Killers'), true);
});
