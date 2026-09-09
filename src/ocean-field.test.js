import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanField, evaluateOceanField, OCEAN_FIELD_STRIDE } from './ocean-field.js';
import { sampleWaves } from './waves.js';
import { createOceanGeometry } from './ocean-surface.js';

test('precomputed wave coefficients preserve height and both slopes at every tested time', () => {
  const coordinates = [-150, -117, -70, 0, 34, 120, 295, 330];
  for (const [anchorX, anchorZ] of [[0, 0], [16, -24]]) {
    const field = createOceanField(coordinates, anchorX, anchorZ);
    assert.equal(field.length, coordinates.length ** 2 * OCEAN_FIELD_STRIDE);
    for (let row = 0; row < coordinates.length; row++) {
      for (let col = 0; col < coordinates.length; col++) {
        for (const time of [0, 1, 17.3, 600, 7200]) {
          const expected = sampleWaves(coordinates[col] + anchorX, coordinates[row] + anchorZ, time);
          const actual = evaluateOceanField(field, row * coordinates.length + col, time);
          for (const key of ['height', 'slopeX', 'slopeZ']) {
            assert.ok(Math.abs(actual[key] - expected[key]) < 1e-6, `${key} at ${row},${col},${time}`);
          }
        }
      }
    }
  }
});

test('the generated field matches the unchanged ocean mesh ordering', () => {
  const geometry = createOceanGeometry();
  const positions = geometry.attributes.position;
  const side = Math.sqrt(positions.count);
  const coordinates = Array.from({ length: side }, (_, i) => positions.getX(i));
  const field = createOceanField(coordinates, 0, 0);
  for (const vertex of [0, 89, side * 61 + 62, positions.count - 1]) {
    const expected = sampleWaves(positions.getX(vertex), positions.getZ(vertex), 5);
    const actual = evaluateOceanField(field, vertex, 5);
    assert.ok(Math.abs(actual.height - expected.height) < 1e-6);
  }
  geometry.dispose();
});
