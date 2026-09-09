import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsland } from './islands.js';
import { ISLANDS, coastRadius, islandHeightAt } from './world.js';

test('island beaches follow the same coastline as waves and collision checks', (t) => {
  for (const [index, island] of ISLANDS.entries()) {
    const group = createIsland(island, index);
    t.after(() => group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); o.geometry?.dispose(); o.material?.dispose(); }));
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
      const radius = coastRadius(island, angle);
      assert.ok(Math.abs(islandHeightAt(island, Math.cos(angle) * radius, Math.sin(angle) * radius)) < 0.01);
    }
    const terrain = group.getObjectByName('island-terrain');
    assert.ok(terrain.geometry.attributes.position.count > 2000);
    assert.ok(Array.from(terrain.geometry.attributes.normal.array).every(Number.isFinite));
    assert.ok(group.getObjectByName('palm-fronds'));
    assert.ok(group.getObjectByName('coastal-rocks'));
  }
});
