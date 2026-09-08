import test from 'node:test';
import assert from 'node:assert/strict';
import { createWake } from './wake.js';
import { createGame } from './game.js';
import { currentAt } from './currents.js';

test('wake follows a curved travelled path with bounded ribbon geometry and freezes on pause', (t) => {
  const wake = createWake(() => 0);
  t.after(() => wake.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }));
  const game = createGame();
  Object.assign(game, { mode: 'sailing', speed: 3, waterSpeed: 3 });
  for (let i = 0; i < 300; i++) {
    game.x = Math.sin(i * 0.015) * 20;
    game.z = -i * 0.3;
    game.velocityX = Math.cos(i * 0.015) * 3;
    game.velocityZ = -3;
    game.heading = 20;
    wake.update(game, i * 0.1, 0.1);
  }
  assert.equal(wake.group.children.length, 3);
  const mesh = wake.group.children[0];
  assert.ok(mesh.geometry.drawRange.count > 0);
  assert.ok(mesh.geometry.attributes.position.count <= 256);
  assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
  const before = Array.from(mesh.geometry.attributes.position.array);
  game.mode = 'paused';
  wake.update(game, 30, 0.1);
  assert.deepEqual(Array.from(mesh.geometry.attributes.position.array), before);
  wake.reset();
  assert.equal(mesh.geometry.drawRange.count, 0);
});

test('drifting with the current alone does not leave a powered wake', () => {
  const wake = createWake(() => 0);
  const game = createGame();
  game.mode = 'sailing';
  for (let i = 0; i < 30; i++) {
    const flow = currentAt(game.x, game.z);
    game.velocityX = flow.x; game.velocityZ = flow.z;
    game.x += flow.x * 0.1; game.z += flow.z * 0.1;
    wake.update(game, i * 0.1, 0.1);
  }
  assert.ok(wake.group.children.every((mesh) => mesh.geometry.drawRange.count === 0));
  wake.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
});
