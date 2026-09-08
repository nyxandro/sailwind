import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarineLife } from './marine-life.js';
import { createGame } from './game.js';
import { ISLANDS } from './world.js';
import { sampleWaves } from './waves.js';

test('only two fish and two dolphins remain, with periodic breaches', (t) => {
  const life = createMarineLife((x, z, time) => sampleWaves(x, z, time).height);
  t.after(() => life.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }));
  const game = createGame();
  const animals = life.group.children.filter((o) => o.name.startsWith('animal-'));
  assert.deepEqual(animals.map((o) => o.name.split('-')[1]).sort(), ['dolphin', 'dolphin', 'fish', 'fish']);
  const seen = new Map();
  for (let time = 0; time < 90; time += 0.25) {
    life.update(game, time);
    for (const animal of life.group.children.filter((o) => o.name.startsWith('animal-'))) {
      if (!animal.visible) continue;
      const kind = animal.name.split('-')[1];
      const height = animal.position.y - sampleWaves(animal.position.x, animal.position.z, time).height;
      if (!seen.has(kind)) seen.set(kind, { below: false, above: false, positions: new Set() });
      const record = seen.get(kind);
      record.below ||= height < -0.3;
      record.above ||= height > 0.5;
      record.positions.add(Math.round(animal.position.x));
      assert.ok(animal.position.toArray().every(Number.isFinite));
      for (const island of ISLANDS) assert.ok(Math.hypot(animal.position.x - island.x, animal.position.z - island.z) > island.radius);
    }
  }
  for (const kind of ['fish', 'dolphin']) {
    assert.ok(seen.get(kind)?.below && seen.get(kind)?.above);
    assert.ok(seen.get(kind)?.positions.size > 3);
  }
});

test('marine life freezes on pause without timers continuing behind the overlay', () => {
  const life = createMarineLife((x, z, time) => sampleWaves(x, z, time).height);
  const game = createGame();
  life.update(game, 10);
  const before = life.group.children.map((o) => [o.visible, ...o.position.toArray(), ...o.rotation.toArray()]);
  game.mode = 'paused';
  life.update(game, 11);
  assert.deepEqual(life.group.children.map((o) => [o.visible, ...o.position.toArray(), ...o.rotation.toArray()]), before);
  life.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
});

test('breaching fish point their noses upward regardless of travel heading', (t) => {
  const life = createMarineLife((x, z, time) => sampleWaves(x, z, time).height);
  t.after(() => life.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }));
  const game = createGame();
  for (const [cycle, heading] of [0, 90, 180, 270].entries()) {
    game.heading = heading;
    life.update(game, 3.3 + cycle * 19);
    life.group.updateMatrixWorld(true);
    const fish = life.group.getObjectByName('animal-fish-0');
    assert.ok(fish.visible);
    assert.equal(fish.rotation.order, 'YXZ');
    assert.ok(fish.rotation.x > 0);
  }
});
