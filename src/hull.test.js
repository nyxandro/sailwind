import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Raycaster, Vector3 } from 'three';
import { createHull } from './hull.js';
import { createIsland } from './islands.js';
import { ISLANDS, coastRadius, islandHeightAt } from './world.js';

test('the hull has a rounded black underwater body, a keel and a separate rudder', (t) => {
  const hull = createHull();
  t.after(() => hull.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }));
  hull.group.updateMatrixWorld(true);
  const underwater = hull.group.getObjectByName('hull-underwater');
  const ray = (x) => new Raycaster(new Vector3(x, -4, 0), new Vector3(0, 1, 0)).intersectObject(underwater)[0];
  const middle = ray(0);
  const side = ray(1.4);
  assert.ok(middle && side);
  assert.ok(side.point.y - middle.point.y > 0.2);
  assert.ok(underwater.material.color.r < 0.05);
  assert.ok(hull.group.getObjectByName('keel'));
  assert.ok(hull.rudder.isGroup);
  const box = new Box3().setFromObject(hull.group);
  assert.ok(box.min.y >= -2.5 && box.min.y < -1.8);
  assert.ok(box.max.z - box.min.z > 10);
  assert.ok(box.max.x - box.min.x < 4.5);
});

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
