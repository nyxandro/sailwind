import test from 'node:test';
import assert from 'node:assert/strict';
import { currentAt, waveExposure } from './currents.js';
import { ISLANDS, coastRadius, shoreDistance } from './world.js';

test('currents vary spatially, stay bounded, and do not flow through islands', () => {
  const directions = new Set();
  for (let x = -600; x <= 600; x += 40) {
    for (let z = -600; z <= 600; z += 40) {
      const flow = currentAt(x, z);
      assert.ok(Number.isFinite(flow.x) && Number.isFinite(flow.z));
      assert.ok(Math.hypot(flow.x, flow.z) <= 0.65 + 1e-6);
      directions.add(`${Math.sign(flow.x)},${Math.sign(flow.z)}`);
    }
  }
  assert.ok(directions.size >= 3);
  for (const island of ISLANDS) assert.deepEqual(currentAt(island.x, island.z), { x: 0, z: 0 });
});

test('near an irregular shore the current is tangent to the actual beach, not just a circle', () => {
  for (const island of ISLANDS) {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.4) {
      const radius = coastRadius(island, angle) + 0.01;
      const x = island.x + Math.cos(angle) * radius;
      const z = island.z + Math.sin(angle) * radius;
      const nx = (shoreDistance(x + 0.001, z, island) - shoreDistance(x - 0.001, z, island)) / 0.002;
      const nz = (shoreDistance(x, z + 0.001, island) - shoreDistance(x, z - 0.001, island)) / 0.002;
      const flow = currentAt(x, z);
      assert.ok(Math.abs(flow.x * nx + flow.z * nz) < 0.002);
    }
  }
});

test('islands absorb approaching waves and shelter their leeward water instead of emitting rings', () => {
  const island = ISLANDS[0];
  const direction = { x: 0.8, z: 0.6 };
  assert.equal(waveExposure(island.x, island.z, direction), 0);
  const upstream = waveExposure(island.x - direction.x * island.radius * 2, island.z - direction.z * island.radius * 2, direction);
  const downstream = waveExposure(island.x + direction.x * island.radius * 2, island.z + direction.z * island.radius * 2, direction);
  assert.ok(upstream > 0.8);
  assert.ok(downstream < upstream * 0.5);
});
