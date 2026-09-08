import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Raycaster, Vector3 } from 'three';
import { createSeabed, sampleSeabed, REEFS, MAX_SEABED_DEPTH, DEPTH_MAP_WORLD_SIZE } from './seabed.js';
import { ISLANDS, shoreDistance } from './world.js';

test('reefs are shallow, channels are deep, and all depths remain safe for the yacht and animals', () => {
  const reef = sampleSeabed(REEFS[0].x, REEFS[0].z);
  const channel = sampleSeabed(-80, 0);
  assert.ok(reef.depth < 8 && reef.reef > 0.9);
  assert.ok(channel.depth > reef.depth + 20);
  for (let x = -900; x <= 900; x += 45) {
    for (let z = -900; z <= 900; z += 45) {
      const a = sampleSeabed(x, z);
      assert.deepEqual(a, sampleSeabed(x, z));
      assert.ok(a.depth >= 5 && a.depth <= MAX_SEABED_DEPTH);
      assert.ok(Math.abs(a.depth - sampleSeabed(x + 0.05, z + 0.05).depth) < 0.25);
    }
  }
  assert.equal(sampleSeabed(1500, 0).depth, MAX_SEABED_DEPTH);
});

test('the optical depth map and coral anchors match the actual seabed triangles', (t) => {
  const seabed = createSeabed();
  t.after(() => {
    seabed.depthMap.dispose();
    seabed.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); o.geometry?.dispose(); o.material?.dispose(); });
  });
  seabed.group.updateMatrixWorld(true);
  const floor = seabed.group.getObjectByName('seabed-terrain');
  for (const [x, z] of [[-80, 0], [REEFS[0].x, REEFS[0].z], [160, -210]]) {
    const hit = new Raycaster(new Vector3(x, 2, z), new Vector3(0, -1, 0)).intersectObject(floor)[0];
    assert.ok(hit);
    assert.ok(Math.abs(hit.point.y - seabed.heightAt(x, z)) < 1e-5);
  }
  const { data, width } = seabed.depthMap.image;
  for (const [col, row] of [[250, 250], [262, 247], [350, 190], [0, 0]]) {
    const x = ((col + 0.5) / width - 0.5) * DEPTH_MAP_WORLD_SIZE;
    const z = ((row + 0.5) / width - 0.5) * DEPTH_MAP_WORLD_SIZE;
    const encodedDepth = data[(row * width + col) * 4 + 1] / 255 * MAX_SEABED_DEPTH;
    assert.ok(Math.abs(encodedDepth + seabed.heightAt(x, z)) <= MAX_SEABED_DEPTH / 255);
  }
  const reefs = seabed.group.children.filter((o) => o.isInstancedMesh);
  assert.equal(reefs.length, 3);
  assert.ok(reefs.reduce((sum, mesh) => sum + mesh.count, 0) > 100);
  const matrix = new Matrix4();
  for (const mesh of reefs) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      const base = new Vector3(0, 0, 0).applyMatrix4(matrix);
      const top = new Vector3(0, 1, 0).applyMatrix4(matrix);
      assert.ok(Math.abs(base.y - seabed.heightAt(base.x, base.z) + 0.12) < 1e-4);
      assert.ok(top.y < -2.8);
      for (const island of ISLANDS) assert.ok(shoreDistance(base.x, base.z, island) > 4);
    }
  }
});
