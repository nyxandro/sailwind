import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanField, createOceanClock, evaluateOceanCoefficients } from './ocean-field.js';
import { createOceanPatch, sampleOceanSurface, oceanDetailWeight } from './ocean-patch.js';
import { createOceanState } from './ocean-state.js';
import { COARSE_OCEAN_COORDINATES, OCEAN_COORDINATES, OCEAN_DETAIL_RADIUS } from './ocean-grid.js';
import { createOceanGeometry, createFarOceanIndices } from './ocean-surface.js';
import { BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';

const coarse = createOceanField(COARSE_OCEAN_COORDINATES, 0, 0);
const origin = createOceanPatch(coarse, 0, 0, null);
const east = createOceanPatch(coarse, 8, 0, origin);

test('moving the patch cannot change a stationary world point, including the old 17 cm jump', () => {
  const detail = { x: 4, z: 0, radius: OCEAN_DETAIL_RADIUS };
  const clock = createOceanClock(12);
  for (const [x, z] of [
    [-15, 15],
    [-35, 28],
    [-33, 64],
    [124, 124],
  ]) {
    const before = sampleOceanSurface(origin, coarse, detail, x, z, clock);
    const after = sampleOceanSurface(east, coarse, detail, x, z, clock);
    assert.ok(Math.abs(after - before) < 1e-6, `${x},${z}: ${after - before}`);
  }
});

test('crossing the actual rounding boundary does not move waves near the yacht', () => {
  const state = createOceanState();
  state.accept({ ...origin, coarseField: coarse });
  state.update(3.999, 0, 12, 0);
  const before = state.heightAt(-15, 15, 12);
  state.accept(east);
  assert.equal(state.update(4.001, 0, 12, 1 / 60).patch.x, 8);
  assert.ok(Math.abs(state.heightAt(-15, 15, 12) - before) < 1e-6);
});

test('newly covered and uncovered strips exactly match the fixed far-water surface', () => {
  const detail = { x: 4, z: 0, radius: OCEAN_DETAIL_RADIUS };
  for (const time of [0, 12, 7000]) {
    const clock = createOceanClock(time);
    for (let x = -140; x <= 148; x += 0.5) {
      for (const z of [-128.5, -64.25, 0.25, 64.25, 128.5]) {
        const before = sampleOceanSurface(origin, coarse, detail, x, z, clock);
        const after = sampleOceanSurface(east, coarse, detail, x, z, clock);
        assert.ok(Math.abs(after - before) < 1e-6, `${x},${z},${time}: ${after - before}`);
      }
    }
  }
});

test('a patch replacement cannot animate a phantom wave after its arrival', () => {
  const state = createOceanState();
  state.accept({ ...origin, coarseField: coarse });
  state.update(4, 0, 12, 0);
  const before = state.heightAt(-15, 15, 12);
  state.accept(east);
  for (let i = 0; i < 120; i++) {
    state.update(4, 0, 12, 1 / 60);
    assert.ok(Math.abs(state.heightAt(-15, 15, 12) - before) < 1e-6);
  }
});

test('incremental generation and a fresh patch have identical coefficients, including reversals', () => {
  const shifted = createOceanPatch(coarse, -8, 16, east);
  const fresh = createOceanPatch(coarse, -8, 16, null);
  assert.deepEqual(shifted.field, fresh.field);
  assert.deepEqual(shifted.coarseSamples, fresh.coarseSamples);
});

test('delayed and obsolete patches never replace the current requested patch', () => {
  const state = createOceanState();
  state.accept({ ...origin, coarseField: coarse });
  state.update(4, 0, 12, 0);
  state.accept(east);
  assert.equal(state.update(-4.1, 0, 12, 0).patch.x, 0);
  state.accept(east);
  assert.equal(state.update(4.1, 0, 12, 0).patch.x, 8);
});

test('near and far meshes cover every tested point once, at the same height used by floating objects', (t) => {
  const nearGeometry = createOceanGeometry();
  const farGeometry = createOceanGeometry(COARSE_OCEAN_COORDINATES);
  const material = new MeshBasicMaterial();
  const near = new Mesh(nearGeometry, material);
  const far = new Mesh(farGeometry, material);
  t.after(() => {
    nearGeometry.dispose();
    farGeometry.dispose();
    material.dispose();
  });
  const clock = createOceanClock(12);
  const detail = { x: 4, z: 0, radius: OCEAN_DETAIL_RADIUS };
  for (let i = 0; i < farGeometry.attributes.position.count; i++) {
    farGeometry.attributes.position.setY(i, evaluateOceanCoefficients(coarse, i, clock).height);
  }
  for (const patch of [origin, east]) {
    farGeometry.setIndex(new BufferAttribute(createFarOceanIndices(patch.x, patch.z), 1));
    const positions = nearGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = OCEAN_COORDINATES[i % OCEAN_COORDINATES.length] + patch.x;
      const z = OCEAN_COORDINATES[Math.floor(i / OCEAN_COORDINATES.length)] + patch.z;
      const weight = oceanDetailWeight(x, z, detail);
      const fineHeight = evaluateOceanCoefficients(patch.field, i, clock).height;
      const coarseHeight = evaluateOceanCoefficients(patch.coarseSamples, i, clock).height;
      positions.setY(i, coarseHeight * (1 - weight) + fineHeight * weight);
    }
    near.position.set(patch.x, 0, patch.z);
    near.updateMatrixWorld();
    far.updateMatrixWorld();
    for (const [x, z] of [
      [-15.23, 15.37],
      [-128.25, 0.37],
      [-120.25, 0.37],
      [128.25, 20.37],
      [136.25, 20.37],
      [280.25, -150.37],
    ]) {
      const hits = new Raycaster(new Vector3(x, 4, z), new Vector3(0, -1, 0)).intersectObjects([near, far], false);
      assert.equal(hits.length, 1, `Gap or overlapping water at ${x},${z}`);
      assert.ok(Math.abs(hits[0].point.y - sampleOceanSurface(patch, coarse, detail, x, z, clock)) < 1e-5);
    }
  }
});

test('recovering a late patch does not instantly change the currently visible detail', () => {
  const distant = createOceanPatch(coarse, 104, 0, origin);
  const state = createOceanState();
  state.accept({ ...origin, coarseField: coarse });
  const waiting = state.update(100, 0, 12, 0.1);
  assert.equal(waiting.detail.radius, 20);
  const before = state.heightAt(100.25, 0.37, 12);
  state.accept(distant);
  const received = state.update(100, 0, 12, 0.1);
  assert.equal(received.detail.radius, 20);
  assert.ok(Math.abs(state.heightAt(100.25, 0.37, 12) - before) < 1e-6);
  assert.equal(state.update(100, 0, 12, 0).detail.radius, 20, 'Paused detail must not advance');
});
