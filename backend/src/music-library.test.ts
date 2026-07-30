import test from 'node:test';
import assert from 'node:assert/strict';
import { artistSearchFallbacks, scoreMusicTextMatch, scoreMusicTitleMatch, shortenedArtistSearch } from './music-library';

test('scoreMusicTitleMatch Accepts Small Spelling and Filename-Prefix Differences', () => {
  assert.equal(scoreMusicTitleMatch('Rock Rock (Till You Drop)', "01 Def Leppard - Rock Rock (Til' You Drop)"), 0.95);
  assert.equal(scoreMusicTitleMatch('Rock Rock (Till You Drop)', "Rock Rock (Til' You Drop)"), 0.95);
  assert.equal(scoreMusicTitleMatch('Photograph', 'Rock of Ages'), 0);
});

test('scoreMusicTitleMatch Accepts Album Qualifiers Such as a Disc Number', () => {
  assert.equal(scoreMusicTitleMatch('Staying A Life', 'Staying A Life, Disc 1'), 0.95);
});

test('scoreMusicTitleMatch Recognizes Equivalent Part and Volume Notation Without Accepting the Base Album', () => {
  assert.equal(scoreMusicTitleMatch('The Metal Opera Pt.II', 'The Metal Opera, Vol. 2'), 1);
  assert.equal(scoreMusicTitleMatch('The Metal Opera Pt.II', 'The Metal Opera'), 0);
  assert.equal(scoreMusicTitleMatch('The Metal Opera Pt.II', 'The Metal Opera Pt. I'), 0);
});

test('scoreMusicTitleMatch Accepts Close Album Spelling When the Core Words Align', () => {
  assert.equal(scoreMusicTitleMatch('Just Sumthin To Do', "Just Somethin' To Do"), 2 / 3);
});

test('scoreMusicTextMatch Treats Low-Value Words Such as the as Optional', () => {
  assert.equal(scoreMusicTextMatch('The Headless Children', 'Headless Children'), 0.95);
  assert.equal(scoreMusicTextMatch('The Doors', 'Doors'), 0.95);
});

test('shortenedArtistSearch Removes Only a Final Term When More Than Two Exist', () => {
  assert.equal(shortenedArtistSearch('The Brian Setzer Orchestra'), 'thebriansetzer');
  assert.equal(shortenedArtistSearch('Iron Maiden'), null);
});

test('artistSearchFallbacks Keeps Trimming One Final Term Until Two Remain', () => {
  assert.deepEqual(artistSearchFallbacks('MC. A.D.E. And Posse'), ['mcadeand', 'mcade']);
});
