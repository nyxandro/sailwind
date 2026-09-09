import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, rigPower, sailingHint } from './game.js';
import { createMainCloth, updateMainCloth } from './sail-cloth.js';
import { createJib, updateJib } from './jib.js';
import { MeshStandardMaterial, Vector3 } from 'three';
import { createRigging, updateRigging } from './rigging.js';
import { Group } from 'three';
import { SAILS } from './world.js';

test('hoists move independently toward selected heights without changing trim, and freeze on pause', () => {
  const game = createGame();
  game.mode = 'sailing';
  game.mainHoistTarget = 0;
  stepGame(game, {}, 0.1);
  assert.ok(game.mainHoist < 1 && game.mainHoist > 0.9);
  assert.equal(game.jibHoist, 1);
  assert.equal(game.mainTrim, 40);
  game.mode = 'paused';
  const paused = structuredClone(game);
  stepGame(game, {}, 0.1);
  assert.deepEqual(game, paused);
  game.mode = 'sailing';
  for (let i = 0; i < 100; i++) stepGame(game, {}, 0.1);
  assert.equal(game.mainHoist, 0);
  game.mainHoistTarget = 0.37;
  game.jibHoistTarget = 0;
  for (let i = 0; i < 100; i++) stepGame(game, {}, 0.1);
  assert.equal(game.mainHoist, 0.37);
  assert.equal(game.jibHoist, 0);
  assert.equal(createGame().mainHoistTarget, 1);
});

test('actual exposed area scales forward and reverse forces with no force at zero hoist', () => {
  for (const trim of [45, -45]) {
    const game = Object.assign(createGame(), { heading: 90, windDirection: 0, mainTrim: trim, jibTrim: trim });
    const full = rigPower(game);
    game.mainHoist = game.jibHoist = 0.5;
    const half = rigPower(game);
    assert.equal(half.drive, full.drive * 0.5);
    assert.equal(half.power, full.power * 0.5);
    game.mainHoist = 0;
    assert.equal(rigPower(game).main.power, 0);
    assert.ok(rigPower(game).jib.power > 0);
    game.jibHoist = 0;
    assert.equal(rigPower(game).power, 0);
    assert.ok(rigPower(game).drive === 0);
  }
});

test('lowered sails preserve inertia and current drift, and hints ignore their trim', () => {
  const game = Object.assign(createGame(), { mode: 'sailing', mainHoist: 0, jibHoist: 0, mainHoistTarget: 0, jibHoistTarget: 0, velocityZ: -2 });
  stepGame(game, {}, 0.1);
  assert.ok(game.z < 0 && game.groundSpeed > 0);
  assert.equal(sailingHint(game).title, 'Паруса спущены');
  game.mainHoist = 1;
  game.heading = 90;
  game.windDirection = 0;
  game.mainTrim = 45;
  game.jibTrim = -45;
  assert.equal(sailingHint(game).title, 'Ты поймал ветер');
  game.mainHoist = 0;
  game.jibHoist = 1;
  game.jibTrim = 45;
  assert.equal(sailingHint(game).title, 'Ты поймал ветер');
  game.mainHoist = game.jibHoist = 0;
  game.velocityX = game.velocityZ = 0;
  for (let i = 0; i < 100; i++) stepGame(game, {}, 0.1);
  assert.ok(game.groundSpeed > 0.08);
});

test('invalid or missing hoist data fails explicitly', () => {
  for (const value of [undefined, NaN, -0.1, 1.1]) {
    const game = createGame();
    game.mainHoist = value;
    assert.throws(() => rigPower(game), /SAIL_HOIST_INVALID/);
    game.mainHoist = 1;
    game.mode = 'sailing';
    game.jibHoistTarget = value;
    assert.throws(() => stepGame(game, {}, 0.1), /SAIL_HOIST_INVALID/);
  }
});

test('cloth gathers at the foot, the jib head follows the stay, and sheets remain attached', (t) => {
  const main = createMainCloth(new MeshStandardMaterial());
  const jib = createJib();
  const boom = new Group();
  const rigging = createRigging();
  t.after(() => {
    for (const mesh of [main, jib]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    rigging.group.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
  });
  for (const hoist of [1, 0.5, 0.01, 0]) {
    updateMainCloth(main, 40, 1, 2, 80, hoist);
    updateJib(jib, -40, 1, 2, 80, hoist);
    updateRigging(rigging, boom, jib);
    for (const [key, mesh] of [['main', main], ['jib', jib]]) {
      const { position, normal, uv } = mesh.geometry.attributes;
      assert.ok(Array.from(position.array).every(Number.isFinite));
      assert.ok(Array.from(normal.array).every(Number.isFinite));
      const ys = Array.from({ length: position.count }, (_, i) => position.getY(i));
      assert.ok(Math.max(...ys) <= SAILS[key].height * hoist + 0.2);
      if (hoist === 0) assert.ok(Math.max(...ys) > 0);
      for (let i = 0; i < uv.count; i++) {
        if (key === 'jib' && uv.getX(i) === 0) {
          assert.ok(Math.abs(position.getY(i) / SAILS.jib.height - position.getZ(i) / SAILS.jib.foot) < 1e-6);
        }
        if (key === 'jib' && uv.getX(i) === 1 && uv.getY(i) === 0) {
          const corner = new Vector3().fromBufferAttribute(position, i).add(jib.position);
          rigging.group.updateMatrixWorld(true);
          assert.ok(rigging.jibPort.localToWorld(new Vector3(0, -0.5, 0)).distanceTo(corner) < 1e-5);
        }
      }
    }
  }
});
