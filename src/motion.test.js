import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './game.js';
import { integrateMotion, windHeel, YACHT_PHYSICS } from './motion.js';
import { radians } from './world.js';

test('a heavy yacht keeps momentum when thrust disappears and loses half its speed gradually', () => {
  const game = createGame();
  game.heading = 0;
  game.velocityZ = -3.5;
  const current = { x: 0, z: 0 };
  for (let i = 0; i < 20; i++) integrateMotion(game, 0, 0, current, 0.05);
  assert.ok(-game.velocityZ > 3.1);
  for (let i = 0; i < 220; i++) integrateMotion(game, 0, 0, current, 0.05);
  assert.ok(-game.velocityZ > 1.4 && -game.velocityZ < 1.95);
  assert.equal(YACHT_PHYSICS.mass, 6400);
});

test('filled sails heel the yacht to leeward even before it has picked up speed', () => {
  const game = createGame();
  game.heading = 0;
  game.windDirection = 270;
  game.windSpeed = 12;
  game.waterSpeed = 0;
  const loaded = windHeel(game, 1);
  assert.ok(loaded < -radians(15) && loaded >= -radians(24));
  assert.ok(Math.abs(windHeel(game, 0)) < 1e-9);
  assert.ok(Math.abs(windHeel(game, 0.5)) < Math.abs(loaded));
  game.waterSpeed = 4;
  assert.equal(windHeel(game, 1), loaded);
  game.windDirection = 90;
  assert.ok(Math.abs(windHeel(game, 1) + loaded) < 1e-9);
  game.windSpeed = 30;
  assert.ok(Math.abs(windHeel(game, 1) - radians(24)) < 1e-9);
});

test('turning the hull does not instantly rotate or erase its velocity vector', () => {
  const game = createGame();
  game.velocityZ = -3;
  game.heading = 90;
  integrateMotion(game, 1, 0, { x: 0, z: 0 }, 0.05);
  assert.ok(game.velocityZ < -2.8);
  assert.ok(Math.abs(game.velocityX) < 0.1);
  assert.ok(Math.abs(game.yawRate) < 1);
});

test('reverse propulsion works, but hull resistance makes it substantially slower', () => {
  const velocities = [];
  for (const force of [2000, -2000]) {
    const game = createGame();
    game.heading = 0;
    for (let i = 0; i < 2400; i++) integrateMotion(game, 0, force, { x: 0, z: 0 }, 0.05);
    velocities.push(game.speed);
  }
  assert.ok(velocities[0] > 3);
  assert.ok(velocities[1] < -1);
  assert.ok(Math.abs(velocities[1]) < velocities[0] * 0.7);
});

test('unpowered drift follows the local current and helm response reverses with sternway', () => {
  const drift = createGame();
  drift.heading = 0;
  for (let i = 0; i < 1600; i++) integrateMotion(drift, 0, 0, { x: 0.25, z: -0.1 }, 0.05);
  assert.ok(Math.abs(drift.velocityX - 0.25) < 0.02);
  assert.ok(Math.abs(drift.velocityZ + 0.1) < 0.03);
  const forward = createGame();
  const reverse = createGame();
  forward.heading = reverse.heading = 0;
  forward.velocityZ = -2;
  reverse.velocityZ = 2;
  for (let i = 0; i < 20; i++) {
    integrateMotion(forward, 1, 0, { x: 0, z: 0 }, 0.05);
    integrateMotion(reverse, 1, 0, { x: 0, z: 0 }, 0.05);
  }
  assert.ok(forward.yawRate > 0);
  assert.ok(reverse.yawRate < 0);
});
