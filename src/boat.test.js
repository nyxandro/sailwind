import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, MeshStandardMaterial, Vector3 } from 'three';
import { setSailTrim } from './boat.js';
import { createJib } from './jib.js';
import { createMainCloth } from './sail-cloth.js';
import { createRigging } from './rigging.js';
import { SAILS } from './world.js';

function createTestYacht(t) {
  const yacht = { boat: new Group(), mainSail: new Group(), mainCloth: createMainCloth(new MeshStandardMaterial()), jib: createJib(), rigging: createRigging() };
  yacht.mainSail.position.set(0, 2.3, -1.15);
  yacht.mainSail.add(yacht.mainCloth);
  yacht.boat.add(yacht.mainSail, yacht.jib, yacht.rigging.group);
  t.after(() => yacht.boat.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }));
  return yacht;
}

test('manual angles remain independent while each sail fills from its own load', (t) => {
  const yacht = createTestYacht(t);
  for (const mainTrim of [-90, 0, 40, 90]) {
    for (const jibTrim of [-90, -40, 0, 90]) {
      setSailTrim(yacht, mainTrim, jibTrim, { main: 1, jib: 0 }, 0, 80);
      assert.equal(yacht.mainSail.rotation.y, mainTrim * Math.PI / 180);
      const positions = yacht.jib.geometry.attributes.position;
      const uv = yacht.jib.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        if (uv.getX(i) !== 1 || uv.getY(i) !== 0) continue;
        assert.ok(Math.abs(positions.getX(i) - Math.sin(jibTrim * Math.PI / 180) * SAILS.jib.foot) < 1e-5);
        assert.ok(Math.abs(positions.getZ(i) - Math.cos(jibTrim * Math.PI / 180) * SAILS.jib.foot) < 1e-5);
      }
      const mainBefore = Array.from(yacht.mainCloth.geometry.attributes.position.array);
      setSailTrim(yacht, mainTrim, jibTrim, { main: 1, jib: 1 }, 0, 80);
      assert.deepEqual(Array.from(yacht.mainCloth.geometry.attributes.position.array), mainBefore);
    }
  }
});

test('a loaded sail is clearly fuller than a stalled sail, without moving its attached edges', (t) => {
  const yacht = createTestYacht(t);
  const filled = [];
  setSailTrim(yacht, 40, 40, { main: 1, jib: 1 }, 0, 80);
  for (const mesh of [yacht.mainCloth, yacht.jib]) filled.push(Array.from(mesh.geometry.attributes.position.array));
  setSailTrim(yacht, 40, 40, { main: 0, jib: 0 }, 0, 80);
  for (const [index, mesh] of [yacht.mainCloth, yacht.jib].entries()) {
    const { position, uv, normal } = mesh.geometry.attributes;
    let largestChange = 0;
    for (let i = 0; i < uv.count; i++) {
      const change = new Vector3().fromBufferAttribute(position, i).distanceTo(new Vector3().fromArray(filled[index], i * 3));
      if (uv.getX(i) === 0 || uv.getX(i) === 1 || uv.getY(i) === 0 || uv.getY(i) === 1) assert.ok(change < 1e-5);
      largestChange = Math.max(largestChange, change);
      assert.ok(new Vector3().fromBufferAttribute(normal, i).toArray().every(Number.isFinite));
    }
    assert.ok(largestChange > 1);
  }
});

test('sheets stay connected to the free corners on either side and after heel', (t) => {
  const yacht = createTestYacht(t);
  for (const trim of [-90, -40, 0, 40, 90]) {
    yacht.boat.rotation.set(0.08, 1.2, -0.12);
    setSailTrim(yacht, trim, -trim, { main: 0.8, jib: 0.4 }, 2, 80);
    yacht.boat.updateMatrixWorld(true);
    const mainCorner = yacht.mainSail.localToWorld(new Vector3(0, 0, SAILS.main.foot));
    const jibCorner = yacht.jib.localToWorld(new Vector3(Math.sin(-trim * Math.PI / 180) * SAILS.jib.foot, 0, Math.cos(-trim * Math.PI / 180) * SAILS.jib.foot));
    for (const [rope, corner] of [[yacht.rigging.main, mainCorner], [yacht.rigging.jibPort, jibCorner], [yacht.rigging.jibStarboard, jibCorner]]) {
      assert.ok(rope.localToWorld(new Vector3(0, -0.5, 0)).distanceTo(corner) < 1e-5);
      assert.ok(rope.scale.y > 0);
    }
  }
});

test('both sails cross the centre continuously and freeze with the visual clock', (t) => {
  const yacht = createTestYacht(t);
  setSailTrim(yacht, -0.01, -0.01, { main: 1, jib: 1 }, 3, 80);
  const before = [yacht.mainCloth, yacht.jib].map((mesh) => Array.from(mesh.geometry.attributes.position.array));
  setSailTrim(yacht, 0.01, 0.01, { main: 1, jib: 1 }, 3, 80);
  for (const [index, mesh] of [yacht.mainCloth, yacht.jib].entries()) {
    mesh.geometry.attributes.position.array.forEach((value, i) => assert.ok(Math.abs(value - before[index][i]) < 0.01));
  }
  const frozen = Array.from(yacht.mainCloth.geometry.attributes.position.array);
  setSailTrim(yacht, 0.01, 0.01, { main: 1, jib: 1 }, 3, 80);
  assert.deepEqual(Array.from(yacht.mainCloth.geometry.attributes.position.array), frozen);
});

test('a centred sail can fill from either wind side without rotating the boom', (t) => {
  const yacht = createTestYacht(t);
  for (const relativeWind of [-60, 60]) {
    setSailTrim(yacht, 0, 0, { main: 0.18, jib: 0.18 }, 0, relativeWind);
    assert.equal(yacht.mainSail.rotation.y, 0);
    const position = yacht.mainCloth.geometry.attributes.position;
    const xs = Array.from({ length: position.count }, (_, i) => position.getX(i));
    assert.ok(Math.max(...xs.map(Math.abs)) > 0.5);
    assert.equal(Math.sign(xs.reduce((a, b) => a + b, 0)), Math.sign(relativeWind));
  }
});
