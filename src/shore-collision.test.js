import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createGame, stepGame } from './game.js';
import { createHull } from './hull.js';
import { ISLANDS, radians, islandHeightAt } from './world.js';

test('grounding prevents the keel entering the submerged beach or the hull entering an irregular shore', (t) => {
  const hull = createHull();
  t.after(() => hull.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }));
  for (const [x, z, heading] of [[453.4003129282039, -270, 0], [373.7991821000201, -211.28032258672852, 105]]) {
    const game = createGame();
    Object.assign(game, { mode: 'sailing', x, z, heading });
    stepGame(game, {}, 0.01);
    assert.ok(game.collision > 0);
    hull.group.position.set(game.x, 0, game.z);
    hull.group.rotation.y = -radians(game.heading);
    hull.group.updateMatrixWorld(true);
    const island = ISLANDS[3];
    hull.group.traverse((object) => {
      if (!object.geometry) return;
      const positions = object.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const p = object.localToWorld(new Vector3().fromBufferAttribute(positions, i));
        assert.ok(islandHeightAt(island, p.x - island.x, p.z - island.z) < -3);
      }
    });
  }
});
