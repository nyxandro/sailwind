import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bindYachtModel, disposeYachtModel, loadYachtModel, setHelm } from './yacht/model.js';
import { RIG_LAYOUT } from './yacht/rig-layout.js';

const modelUrl = new URL('../public/models/oceanis.glb', import.meta.url);

async function model(t) {
  const bytes = await readFile(modelUrl);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  t.after(() => disposeYachtModel(gltf.scene));
  return gltf.scene;
}

test('the shipped hull fits the existing grounding envelope and has finite web geometry', async (t) => {
  const hull = bindYachtModel(await model(t));
  hull.group.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(hull.group);
  assert.ok(bounds.min.y < -1.4 && bounds.min.y > -2.5);
  assert.ok(bounds.max.z - bounds.min.z > 10);
  let triangles = 0;
  hull.group.traverse((obj) => {
    if (!obj.isMesh) return;
    const position = obj.geometry.attributes.position;
    assert.ok(Array.from(position.array).every(Number.isFinite));
    assert.ok(Array.from(obj.geometry.attributes.normal.array).every(Number.isFinite));
    triangles += obj.geometry.index.count / 3;
    for (let i = 0; i < position.count; i++) {
      const p = new Vector3().fromBufferAttribute(position, i).applyMatrix4(obj.matrixWorld);
      assert.ok(Math.hypot(p.x, Math.max(0, Math.abs(p.z) - 4.1)) < 2.1, `Outside collision envelope: ${obj.name}`);
    }
  });
  assert.ok(triangles > 20000 && triangles < 60000);
  assert.equal(hull.group.getObjectByName('Veil'), undefined);
  assert.equal(hull.group.getObjectByName('Mast'), undefined);
  const canopy = new Box3().setFromObject(hull.group.getObjectByName('Flange'));
  assert.ok(RIG_LAYOUT.mainBase[1] - 0.1 > canopy.max.y, 'The moving boom must clear the cockpit arch');
  const painted = [];
  hull.group.getObjectByName('yacht-hull').traverse((obj) => {
    if (obj.isMesh && obj.material.name === 'underwater-paint') painted.push(obj);
  });
  assert.equal(painted.length, 1);
  assert.ok(new Box3().setFromObject(painted[0]).max.y <= 0.081);
});

test('cancelling during GLB parsing releases the loaded geometry before rejecting', async (t) => {
  const root = await model(t);
  const mesh = root.getObjectByProperty('isMesh', true);
  const dispose = t.mock.method(mesh.geometry, 'dispose');
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1])));
  t.mock.method(GLTFLoader.prototype, 'parseAsync', async () => {
    controller.abort();
    return { scene: root };
  });
  await assert.rejects(loadYachtModel('/models/oceanis.glb', controller.signal), { name: 'AbortError' });
  assert.equal(dispose.mock.callCount(), 1);
});

test('both rudders and wheels turn about their own fixed pivots', async (t) => {
  const hull = bindYachtModel(await model(t));
  assert.equal(hull.rudders.length, 2);
  assert.equal(hull.helms.length, 2);
  assert.ok(hull.rudders[0].position.x * hull.rudders[1].position.x < 0);
  const pivots = [...hull.rudders, ...hull.helms].map((obj) => obj.position.clone());
  setHelm(hull, 1);
  for (const obj of hull.rudders) assert.ok(Math.abs(obj.rotation.y - Math.PI / 6) < 1e-10);
  for (const obj of hull.helms) assert.equal(obj.rotation.z, -Math.PI * 0.75);
  setHelm(hull, -1);
  [...hull.rudders, ...hull.helms].forEach((obj, i) => assert.ok(obj.position.equals(pivots[i])));
  setHelm(hull, 0);
  for (const obj of hull.rudders) assert.equal(obj.rotation.y, 0);
});

test('a broken model contract fails before a yacht with disconnected controls is shown', async (t) => {
  const root = await model(t);
  const rudder = root.getObjectByName('rudder-port');
  rudder.removeFromParent();
  t.after(() => disposeYachtModel(rudder));
  assert.throws(() => bindYachtModel(root), /YACHT_MODEL_INVALID.*rudder-port/);
});

test('model loading uses the request signal and fails explicitly on missing or malformed assets', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/models/oceanis.glb');
    assert.equal(options.signal, controller.signal);
    return new Response(await readFile(modelUrl));
  });
  const hull = await loadYachtModel('/models/oceanis.glb', controller.signal);
  t.after(() => disposeYachtModel(hull.group));
  assert.equal(hull.rudders.length, 2);
  globalThis.fetch.mock.mockImplementation(async () => new Response('', { status: 404 }));
  await assert.rejects(loadYachtModel('/models/oceanis.glb', controller.signal), /YACHT_MODEL_FAILED.*404/);
  globalThis.fetch.mock.mockImplementation(async () => new Response('invalid model'));
  await assert.rejects(loadYachtModel('/models/oceanis.glb', controller.signal), (error) => /YACHT_MODEL_FAILED/.test(error.message) && error.cause instanceof Error);
  controller.abort();
  const calls = globalThis.fetch.mock.callCount();
  await assert.rejects(loadYachtModel('/models/oceanis.glb', controller.signal), { name: 'AbortError' });
  assert.equal(globalThis.fetch.mock.callCount(), calls);
});
