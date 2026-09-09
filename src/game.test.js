import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, sailPower, rigPower, sailingHint } from './game.js';
import { signedAngle, clamp, ROUTE, ISLANDS, WORLD_RADIUS, shoreDistance } from './world.js';

function createRaisedGame() {
  return Object.assign(createGame(), { mainHoist: 1, jibHoist: 1, mainHoistTarget: 1, jibHoistTarget: 1, mainTrim: 40, jibTrim: 40 });
}

test('a fresh voyage is paused with a reachable first waypoint', () => {
  const game = createGame();
  assert.equal(game.mode, 'ready');
  assert.equal(game.waypoint, 0);
  assert.equal(game.speed, 0);
  for (const key of ['main', 'jib']) {
    assert.equal(game[`${key}Trim`], 0);
    assert.equal(game[`${key}Hoist`], 0);
    assert.equal(game[`${key}HoistTarget`], 0);
  }
  assert.ok(ROUTE.length >= 3);
});

test('starting a voyage leaves sails lowered and neutral until the player raises them', () => {
  const game = createGame();
  game.mode = 'sailing';
  for (let i = 0; i < 60; i++) stepGame(game, {}, 0.1);
  assert.equal(rigPower(game).power, 0);
  assert.equal(sailingHint(game).title, 'Паруса спущены');
  for (const key of ['main', 'jib']) {
    assert.equal(game[`${key}Trim`], 0);
    assert.equal(game[`${key}Hoist`], 0);
    assert.equal(game[`${key}HoistTarget`], 0);
  }
  game.mainHoistTarget = 1;
  stepGame(game, {}, 0.1);
  assert.ok(game.mainHoist > 0);
  assert.equal(game.jibHoist, 0);
  assert.equal(game.mainTrim, 0);
});

test('sailing into the wind produces no drive, even with a trimmed sail', () => {
  assert.equal(sailPower(0, 0, 15).power, 0);
  assert.equal(sailPower(25, 0, 15).power, 0);
  assert.equal(sailPower(345, 0, 15).power, 0);
});

test('a correctly trimmed beam reach produces more power than a loose sail', () => {
  const good = sailPower(90, 0, 45);
  const bad = sailPower(90, 0, 90);
  assert.ok(good.power > 0.9);
  assert.ok(good.power > bad.power * 2);
  assert.equal(good.idealTrim, 45);
});

test('port and starboard tacks are symmetric and angles wrap', () => {
  assert.equal(sailPower(90, 0, 45).power, sailPower(270, 0, -45).power);
  assert.equal(sailPower(270, 0, -45).idealTrim, -45);
  assert.equal(signedAngle(350, 10), -20);
  assert.equal(signedAngle(10, 350), 20);
});

test('a yacht accelerates with wind, moves, and coasts to a stop in irons', () => {
  const game = createRaisedGame();
  game.mode = 'sailing';
  game.heading = 30;
  game.mainTrim = 45;
  game.jibTrim = 45;
  for (let i = 0; i < 100; i++) stepGame(game, {}, 0.05);
  assert.ok(game.speed > 1);
  assert.ok(game.x > 0);
  game.heading = game.windDirection;
  const previousSpeed = game.speed;
  for (let i = 0; i < 100; i++) {
    game.heading = game.windDirection;
    stepGame(game, {}, 0.05);
  }
  assert.ok(game.speed < previousSpeed / 2);
});

test('paused game does not advance position, wind, or elapsed time', () => {
  const game = createGame();
  game.mode = 'paused';
  const before = structuredClone(game);
  stepGame(game, { rudder: 1, mainTrim: 1, jibTrim: -1 }, 0.05);
  assert.deepEqual(game, before);
});

test('rudder can turn a stalled yacht out of the no-go zone', () => {
  const game = createRaisedGame();
  game.mode = 'sailing';
  game.heading = game.windDirection;
  const initial = game.heading;
  for (let i = 0; i < 500; i++) stepGame(game, { rudder: 1 }, 0.05);
  assert.ok(Math.abs(signedAngle(game.heading, initial)) > 40);
});

test('only the next buoy counts and finishing stops the timer', () => {
  const game = createGame();
  game.mode = 'sailing';
  Object.assign(game, ROUTE[1]);
  stepGame(game, {}, 0.01);
  assert.equal(game.waypoint, 0);
  for (const point of ROUTE) {
    game.x = point.x;
    game.z = point.z;
    stepGame(game, {}, 0.01);
  }
  assert.equal(game.mode, 'finished');
  assert.equal(game.waypoint, ROUTE.length);
  const elapsed = game.elapsed;
  stepGame(game, {}, 0.05);
  assert.equal(game.elapsed, elapsed);
});

test('islands stop the boat and keep it outside solid land', () => {
  const game = createGame();
  game.mode = 'sailing';
  game.x = ISLANDS[0].x;
  game.z = ISLANDS[0].z;
  game.velocityX = 5;
  stepGame(game, {}, 0.05);
  assert.ok(shoreDistance(game.x, game.z, ISLANDS[0]) >= 2);
  assert.equal(game.speed, 0);
  assert.ok(game.collision > 0);
});

test('trim is bounded and a long frame cannot teleport the yacht', () => {
  const game = createGame();
  game.mode = 'sailing';
  game.mainTrim = 89;
  game.jibTrim = -89;
  game.velocityZ = -6;
  stepGame(game, { mainTrim: 1, jibTrim: -1 }, 30);
  assert.equal(game.mainTrim, 90);
  assert.equal(game.jibTrim, -90);
  assert.ok(Math.hypot(game.x, game.z) < 1);
  game.mainTrim = -89;
  game.jibTrim = 89;
  stepGame(game, { mainTrim: -1, jibTrim: 1 }, 0.1);
  assert.equal(game.mainTrim, -90);
  assert.equal(game.jibTrim, 90);
});

test('backed sails produce reverse thrust on either beam reach instead of clamping to zero', () => {
  assert.ok(sailPower(90, 0, -45).drive < 0);
  assert.ok(sailPower(270, 0, 45).drive < 0);
  assert.equal(sailPower(90, 0, -45).power, 1);
  assert.ok(sailPower(270, 0, -45).power > 0.9);
});

test('a following wind works on either manually selected side without a power jump', () => {
  for (const trim of [-90, 90]) {
    assert.ok(sailPower(180, 0, trim).power > 0.7);
    assert.ok(Math.abs(sailPower(179.9, 0, trim).power - sailPower(180.1, 0, trim).power) < 0.001);
  }
});

test('steering across the wind never changes the selected sail angle or side', () => {
  for (const trim of [-70, 0, 40]) {
    const game = createGame();
    game.mode = 'sailing';
    game.mainTrim = trim;
    game.jibTrim = -trim;
    game.heading = 290;
    for (let i = 0; i < 500; i++) stepGame(game, { rudder: 1 }, 0.1);
    assert.equal(game.mainTrim, trim);
    assert.ok(game.jibTrim === -trim);
  }
});

test('manual trim crosses the centre continuously in both directions', () => {
  const game = createGame();
  game.mode = 'sailing';
  game.mainTrim = 1;
  game.jibTrim = -1;
  stepGame(game, { mainTrim: -1, jibTrim: 1 }, 0.1);
  assert.ok(game.mainTrim < 0 && game.mainTrim > -2);
  assert.ok(game.jibTrim > 0 && game.jibTrim < 2);
  stepGame(game, { mainTrim: 1, jibTrim: -1 }, 0.1);
  assert.ok(Math.abs(game.mainTrim - 1) < 0.001);
  assert.ok(Math.abs(game.jibTrim + 1) < 0.001);
});

test('backing the sails is reported as reverse thrust, not a dead sail', () => {
  const game = createRaisedGame();
  game.heading = 90;
  game.windDirection = 0;
  game.mainTrim = game.jibTrim = -45;
  assert.equal(sailingHint(game).title, 'Паруса тянут назад');
  game.heading = 270;
  game.mainTrim = game.jibTrim = 45;
  assert.equal(sailingHint(game).title, 'Паруса тянут назад');
});

test('near a following wind the hint improves the selected side instead of forcing a crossing', () => {
  const game = createRaisedGame();
  game.windDirection = 0;
  for (const [heading, trim, direction, title] of [
    [179, -70, -1, 'Переведи грот влево'],
    [181, 70, 1, 'Переведи грот вправо'],
  ]) {
    game.heading = heading;
    game.mainTrim = game.jibTrim = trim;
    const current = sailPower(heading, 0, trim);
    assert.equal(current.idealTrim, direction * 90);
    assert.equal(sailingHint(game).title, title);
    assert.ok(sailPower(heading, 0, trim + direction).power > current.power);
  }
});

test('if the current side cannot catch enough wind, hints consistently guide a manual side change', () => {
  const game = createRaisedGame();
  game.windDirection = 0;
  for (const side of [-1, 1]) {
    game.heading = side < 0 ? 140 : 220;
    for (const angle of [90, 89, 70, 45, 1]) {
      game.mainTrim = game.jibTrim = side * angle;
      assert.equal(sailPower(game.heading, 0, game.mainTrim).idealTrim, -side * 70);
      assert.equal(sailingHint(game).title, rigPower(game).drive < -0.03 ? 'Паруса тянут назад' : side < 0 ? 'Переведи грот вправо' : 'Переведи грот влево');
    }
  }
});

test('the complete route can be sailed without teleporting or hitting land', () => {
  const game = createRaisedGame();
  game.mode = 'sailing';
  let touchedLand = false;
  for (let i = 0; i < 12000 && game.mode === 'sailing'; i++) {
    const point = ROUTE[game.waypoint];
    let bearing = (Math.atan2(point.x - game.x, game.z - point.z) * 180 / Math.PI + 360) % 360;
    const windAngle = signedAngle(bearing, game.windDirection);
    if (Math.abs(windAngle) < 45) bearing = game.windDirection + (windAngle < 0 ? -50 : 50);
    const rig = rigPower(game);
    stepGame(game, {
      rudder: clamp(signedAngle(bearing, game.heading) / 10, -1, 1),
      mainTrim: clamp((rig.main.idealTrim - game.mainTrim) / 4, -1, 1),
      jibTrim: clamp((rig.jib.idealTrim - game.jibTrim) / 4, -1, 1),
    }, 0.1);
    if (game.collision > 0) touchedLand = true;
  }
  assert.equal(game.mode, 'finished');
  assert.equal(game.waypoint, ROUTE.length);
  assert.equal(touchedLand, false);
  assert.ok(game.distance > 700);
});

test('the edge of the map stops outward travel but allows a return', () => {
  const game = createRaisedGame();
  game.mode = 'sailing';
  game.x = WORLD_RADIUS;
  game.heading = 90;
  game.velocityX = 5;
  stepGame(game, {}, 0.1);
  assert.ok(Math.hypot(game.x, game.z) <= WORLD_RADIUS + 0.001);
  assert.equal(game.speed, 0);
  assert.equal(game.boundary, true);
  game.heading = 270;
  game.mainTrim = game.jibTrim = -20;
  for (let i = 0; i < 250; i++) stepGame(game, { rudder: -0.05 }, 0.1);
  assert.ok(game.x < WORLD_RADIUS - 1);
});

test('each control changes only its own sail and a reset restores both', () => {
  const game = createGame();
  game.mode = 'sailing';
  stepGame(game, { mainTrim: -1 }, 0.1);
  assert.ok(game.mainTrim < 0);
  assert.equal(game.jibTrim, 0);
  const main = game.mainTrim;
  stepGame(game, { jibTrim: 1 }, 0.1);
  assert.equal(game.mainTrim, main);
  assert.ok(game.jibTrim > 0);
  assert.equal(createGame().mainTrim, 0);
  assert.equal(createGame().jibTrim, 0);
});

test('independent forces combine by sail area; either sail can drive the yacht alone', () => {
  const game = createRaisedGame();
  game.heading = 90;
  game.windDirection = 0;
  game.mainTrim = game.jibTrim = 45;
  const both = rigPower(game);
  game.jibTrim = 0;
  const mainOnly = rigPower(game);
  assert.equal(mainOnly.main.power, both.main.power);
  assert.ok(mainOnly.jib.power < 1e-10);
  game.mainTrim = 0;
  game.jibTrim = 45;
  const jibOnly = rigPower(game);
  assert.ok(jibOnly.main.power < 1e-10);
  assert.equal(jibOnly.jib.power, both.jib.power);
  assert.ok(mainOnly.power > jibOnly.power && jibOnly.power > 0);
  assert.ok(Math.abs(mainOnly.power + jibOnly.power - both.power) < 1e-10);
  game.jibTrim = 0;
  assert.ok(rigPower(game).power < 1e-10);
});

test('opposing sail forces slow the yacht, and both backed sails eventually drive it astern', () => {
  const speeds = [];
  for (const [mainTrim, jibTrim] of [[40, 40], [40, -40], [-40, 40], [-40, -40]]) {
    const game = createRaisedGame();
    Object.assign(game, { mode: 'sailing', mainTrim, jibTrim });
    for (let i = 0; i < 300; i++) stepGame(game, {}, 0.1);
    speeds.push(game.speed);
  }
  assert.ok(speeds[0] > speeds[1] && speeds[1] > speeds[2] && speeds[2] > speeds[3]);
  assert.ok(speeds[3] < -0.3);
});

test('feedback identifies the sail that needs attention', () => {
  const game = createRaisedGame();
  game.heading = 90;
  game.windDirection = 0;
  game.mainTrim = 45;
  game.jibTrim = -45;
  assert.equal(sailingHint(game).title, 'Переведи стаксель вправо');
  game.mainTrim = -45;
  game.jibTrim = 45;
  assert.equal(sailingHint(game).title, 'Переведи грот вправо');
});
