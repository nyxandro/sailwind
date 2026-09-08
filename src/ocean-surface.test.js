import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { createOceanGeometry, sampleOceanHeight } from './ocean-surface.js';
import { sampleWaves, applyBuoyancy, createBuoyancyState } from './waves.js';

test('floating objects sample the actual water triangles, including distant buoys', () => {
  const geometry = createOceanGeometry();
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  const positions = geometry.attributes.position;
  const time = 4.5;
  for (const [anchorX, anchorZ] of [[0, 0], [48, -24]]) {
    for (let i = 0; i < positions.count; i++) positions.setY(i, sampleWaves(positions.getX(i) + anchorX, positions.getZ(i) + anchorZ, time).height);
    mesh.position.set(anchorX, 0, anchorZ);
    mesh.updateMatrixWorld();
    for (const [x, z] of [[0.2, 0.3], [55, -120], [165, -240], [280, -150]]) {
      const hit = new Raycaster(new Vector3(x, 4, z), new Vector3(0, -1, 0)).intersectObject(mesh)[0];
      assert.ok(hit);
      assert.ok(Math.abs(sampleOceanHeight(x, z, time, anchorX, anchorZ) - hit.point.y) < 1e-5);
    }
  }
  geometry.dispose();
  mesh.material.dispose();
});

test('the yacht pitches towards the wave crest at all four headings', () => {
  const boat = new Mesh();
  const heightAt = (x, z, time) => sampleWaves(x, z, time).height;
  for (const heading of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    applyBuoyancy(boat, 0, 0, heading, 0, 0, heightAt, createBuoyancyState(), 0.1);
    boat.updateMatrixWorld();
    const actual = boat.localToWorld(new Vector3(0, 0, -4)).y - boat.localToWorld(new Vector3(0, 0, 4)).y;
    const expected = heightAt(Math.sin(heading) * 4, -Math.cos(heading) * 4, 0) - heightAt(-Math.sin(heading) * 4, Math.cos(heading) * 4, 0);
    assert.equal(Math.sign(actual), Math.sign(expected));
    assert.ok(Math.abs(actual - expected * 0.5) < 0.02);
  }
  boat.geometry.dispose();
  boat.material.dispose();
});

test('a heavy hull filters short heave and roll and does not keep moving on pause', () => {
  const boat = new Mesh();
  const state = createBuoyancyState();
  applyBuoyancy(boat, 0, 0, 0, 0, 0, () => 0, state, 0.1);
  const crest = (x) => 0.6 + x * 0.08;
  for (let i = 0; i < 5; i++) applyBuoyancy(boat, 0, 0, 0, 1, 0, crest, state, 0.1);
  assert.ok(boat.position.y > 0 && boat.position.y < 0.3);
  assert.ok(Math.abs(boat.rotation.z) < 0.04);
  const paused = structuredClone(state);
  applyBuoyancy(boat, 0, 0, 0, 1, 0, crest, state, 0);
  assert.deepEqual(state, paused);
  for (let i = 0; i < 100; i++) applyBuoyancy(boat, 0, 0, 0, 1, 0, crest, state, 0.1);
  assert.ok(Math.abs(boat.position.y - 0.6) < 0.01);
  boat.geometry.dispose();
  boat.material.dispose();
});

test('steady wind heel is visible without increasing wave-driven rocking', () => {
  const boat = new Mesh();
  const state = createBuoyancyState();
  applyBuoyancy(boat, 0, 0, 0, 0, 0, () => 0, state, 0.1);
  const heel = 19 * Math.PI / 180;
  for (let i = 0; i < 80; i++) applyBuoyancy(boat, 0, 0, 0, i * 0.1, heel, () => 0, state, 0.1);
  assert.ok(Math.abs(boat.rotation.z - heel) < 0.01);
  assert.equal(boat.rotation.x, 0);
  assert.equal(boat.position.y, 0);
  for (let i = 0; i < 100; i++) applyBuoyancy(boat, 0, 0, 0, 10, 2, () => 0, state, 0.1);
  assert.ok(boat.rotation.z <= 26 * Math.PI / 180 + 1e-9);
  boat.geometry.dispose();
  boat.material.dispose();
});

test('without wind the previous wave-only roll limit remains in force', () => {
  const boat = new Mesh();
  const state = createBuoyancyState();
  applyBuoyancy(boat, 0, 0, 0, 0, 0, (x) => x, state, 0.1);
  assert.ok(Math.abs(boat.rotation.z) <= 0.12);
  boat.geometry.dispose();
  boat.material.dispose();
});
