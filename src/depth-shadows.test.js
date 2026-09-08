import test from 'node:test';
import assert from 'node:assert/strict';
import { shadowAtDepth } from './depth-shadows.js';

test('bottom shadows soften and fade with depth, and disappear in deep water', () => {
  const shallow = shadowAtDepth(5);
  const middle = shadowAtDepth(14);
  const deep = shadowAtDepth(30);
  assert.ok(shallow.strength > middle.strength && middle.strength > 0);
  assert.ok(middle.radius > shallow.radius);
  assert.equal(deep.strength, 0);
  assert.equal(shadowAtDepth(60).strength, 0);
});
