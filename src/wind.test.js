import test from 'node:test';
import assert from 'node:assert/strict';
import { createWind } from './wind.js';
import { createGame } from './game.js';

test('wind traces move away from the source shown by the compass, independently of yacht heading', () => {
  for (const [direction, axis, sign] of [[0, 2, 1], [90, 0, -1], [180, 2, -1], [270, 0, 1]]) {
    const wind = createWind();
    const game = createGame();
    game.windDirection = direction;
    wind.update(game, 0);
    const before = Array.from(wind.object.geometry.attributes.position.array);
    game.heading = 170;
    wind.update(game, 0.1);
    const after = wind.object.geometry.attributes.position.array;
    assert.ok(Math.abs(after[axis] - before[axis] - sign * game.windSpeed * 0.514444 * 0.1) < 1e-4);
    const otherAxis = axis === 0 ? 2 : 0;
    assert.ok(Math.abs(after[otherAxis] - before[otherAxis]) < 1e-4);
    wind.object.geometry.dispose();
    wind.object.material.dispose();
  }
});

test('paused and hidden wind traces stop updating and remain finite across a long voyage', () => {
  const wind = createWind();
  const game = createGame();
  wind.update(game, 0);
  const position = wind.object.geometry.attributes.position;
  const before = Array.from(position.array);
  game.mode = 'paused';
  wind.update(game, 0.1);
  assert.deepEqual(Array.from(position.array), before);
  game.mode = 'sailing';
  wind.object.visible = false;
  wind.update(game, 0.1);
  assert.deepEqual(Array.from(position.array), before);
  wind.object.visible = true;
  for (let i = 0; i < 500; i++) {
    game.x += 0.5;
    game.windDirection = i % 360;
    wind.update(game, 0.1);
  }
  assert.ok(Array.from(position.array).every(Number.isFinite));
  const colors = wind.object.geometry.attributes.color;
  for (let i = 0; i < colors.count; i++) assert.ok(colors.getW(i) >= 0 && colors.getW(i) <= 1);
  wind.object.geometry.dispose();
  wind.object.material.dispose();
});
