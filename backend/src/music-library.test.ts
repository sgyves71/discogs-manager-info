import test from 'node:test';
import assert from 'node:assert/strict';
import { artistSearchFallbacks, scoreMusicTextMatch, scoreMusicTitleMatch, shortenedArtistSearch } from './music-library';

test('scoreMusicTitleMatch accepts small spelling and filename-prefix differences', () => {
  assert.equal(scoreMusicTitleMatch('Rock Rock (Till You Drop)', "01 Def Leppard - Rock Rock (Til' You Drop)"), 0.95);
  assert.equal(scoreMusicTitleMatch('Rock Rock (Till You Drop)', "Rock Rock (Til' You Drop)"), 0.95);
  assert.equal(scoreMusicTitleMatch('Photograph', 'Rock of Ages'), 0);
});

test('scoreMusicTitleMatch accepts album qualifiers such as a disc number', () => {
  assert.equal(scoreMusicTitleMatch('Staying A Life', 'Staying A Life, Disc 1'), 0.95);
});

test('scoreMusicTitleMatch accepts close album spelling when the core words align', () => {
  assert.equal(scoreMusicTitleMatch('Just Sumthin To Do', "Just Somethin' To Do"), 2 / 3);
});

test('scoreMusicTextMatch treats low-value words such as the as optional', () => {
  assert.equal(scoreMusicTextMatch('The Headless Children', 'Headless Children'), 0.95);
  assert.equal(scoreMusicTextMatch('The Doors', 'Doors'), 0.95);
});

test('shortenedArtistSearch removes only a final term when more than two exist', () => {
  assert.equal(shortenedArtistSearch('The Brian Setzer Orchestra'), 'thebriansetzer');
  assert.equal(shortenedArtistSearch('Iron Maiden'), null);
});

test('artistSearchFallbacks keeps trimming one final term until two remain', () => {
  assert.deepEqual(artistSearchFallbacks('MC. A.D.E. And Posse'), ['mcadeand', 'mcade']);
});
