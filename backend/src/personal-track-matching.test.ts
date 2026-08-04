import test from 'node:test';
import assert from 'node:assert/strict';
import { physicalTrackKeys } from './personal-track-matching.js';

test('physicalTrackKeys Groups Lettered Siblings On One Physical Track', () => {
  const keys = physicalTrackKeys([
    { trackKey: '5|Mama Kin', title: 'Mama Kin' },
    { trackKey: '6a|Three Mile Smile', title: 'Three Mile Smile' },
    { trackKey: '6b|Reefer Head Woman', title: 'Reefer Head Woman' },
    { trackKey: '7|Lord Of The Thighs', title: 'Lord Of The Thighs' },
  ]);

  assert.equal(keys.get('6a|Three Mile Smile'), 'subtracks:6');
  assert.equal(keys.get('6b|Reefer Head Woman'), 'subtracks:6');
  assert.notEqual(keys.get('5|Mama Kin'), keys.get('7|Lord Of The Thighs'));
});

test('physicalTrackKeys Does Not Group A Lone Letter-Suffixed Position', () => {
  const keys = physicalTrackKeys([{ trackKey: 'A1a|Opening', title: 'Opening' }]);
  assert.equal(keys.get('A1a|Opening'), 'track:A1a|Opening');
});
