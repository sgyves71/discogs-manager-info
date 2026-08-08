import assert from 'node:assert/strict';
import test from 'node:test';
import { adjacentIndex } from './playback-queue-service.js';

test('adjacentIndex moves in the requested playback direction', () => {
  assert.equal(adjacentIndex(4, 'next'), 5);
  assert.equal(adjacentIndex(4, 'previous'), 3);
});
