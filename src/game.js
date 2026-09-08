import { ROUTE, BUOY_RADIUS, WORLD_RADIUS, MAX_SAIL_ANGLE, SAILS, radians, signedAngle, clamp } from './world.js';
import { currentAt } from './currents.js';
import { integrateMotion, YACHT_PHYSICS } from './motion.js';
import { resolveShoreCollision } from './shore-collision.js';

const MIN_TRIM_EFFICIENCY = 0.78;

export function createGame() {
  const current = currentAt(0, 0);
  return {
    mode: 'ready', x: 0, z: 0, heading: 20, mainTrim: 40, jibTrim: 40, speed: 0,
    velocityX: 0, velocityZ: 0, waterSpeed: 0, groundSpeed: 0, yawRate: 0, rudder: 0,
    currentX: current.x, currentZ: current.z,
    windDirection: 300, windSpeed: 12, elapsed: 0, distance: 0,
    waypoint: 0, maxSpeed: 0, collision: 0, boundary: false,
  };
}

export function sailPower(heading, windDirection, trim) {
  const relativeWind = signedAngle(heading, windDirection);
  const angle = Math.abs(relativeWind);
  // Compare signed sail orientation on a circle: either side works directly downwind.
  const trimError = signedAngle(trim * 2, relativeWind);
  const alignment = Math.cos(radians(trimError));
  const efficiency = Math.max(0, alignment) ** 2;
  const sameSideIdeal = clamp(trim - trimError / 2, -MAX_SAIL_ANGLE, MAX_SAIL_ANGLE);
  const sameSideEfficiency = Math.max(0, Math.cos(radians(signedAngle(sameSideIdeal * 2, relativeWind)))) ** 2;
  // Do not guide the player back to a range limit that still cannot fill the sail.
  const idealTrim = Math.abs(trimError) < 90 && sameSideEfficiency >= MIN_TRIM_EFFICIENCY ? sameSideIdeal : relativeWind / 2;
  const polar = (windAngle) => windAngle < 35 ? 0 : Math.min(1, (windAngle - 35) / 35) * (0.72 + 0.28 * Math.sin(radians(windAngle)));
  const forward = polar(angle) * efficiency;
  const backward = polar(180 - angle) * Math.max(0, -alignment) ** 2;
  return { power: forward + backward, drive: forward - backward * YACHT_PHYSICS.reverseDrive, efficiency, angle, idealTrim };
}

export function rigPower(game) {
  const main = sailPower(game.heading, game.windDirection, game.mainTrim);
  const jib = sailPower(game.heading, game.windDirection, game.jibTrim);
  const mainArea = SAILS.main.height * SAILS.main.foot / 2;
  const jibArea = SAILS.jib.height * SAILS.jib.foot / 2;
  return {
    main, jib, power: (main.power * mainArea + jib.power * jibArea) / (mainArea + jibArea),
    drive: (main.drive * mainArea + jib.drive * jibArea) / (mainArea + jibArea),
  };
}

export function stepGame(game, input, delta) {
  if (game.mode !== 'sailing') return;
  // Bound the simulation step after suspended tabs or slow frames.
  const dt = clamp(delta, 0, 0.1);
  game.elapsed += dt;
  game.windDirection = 300 + Math.sin(game.elapsed * 0.025) * 14;
  game.windSpeed = 12 + Math.sin(game.elapsed * 0.13) * 1.6;
  game.mainTrim = clamp(game.mainTrim + (input.mainTrim ?? 0) * 28 * dt, -MAX_SAIL_ANGLE, MAX_SAIL_ANGLE);
  game.jibTrim = clamp(game.jibTrim + (input.jibTrim ?? 0) * 28 * dt, -MAX_SAIL_ANGLE, MAX_SAIL_ANGLE);
  const { drive } = rigPower(game);
  const sailArea = (SAILS.main.height * SAILS.main.foot + SAILS.jib.height * SAILS.jib.foot) / 2;
  const driveForce = 0.5 * YACHT_PHYSICS.airDensity * (game.windSpeed * 0.514444) ** 2 * sailArea * YACHT_PHYSICS.sailCoefficient * drive;
  integrateMotion(game, input.rudder ?? 0, driveForce, currentAt(game.x, game.z), dt);
  const oldX = game.x;
  const oldZ = game.z;
  game.x += game.velocityX * dt;
  game.z += game.velocityZ * dt;
  game.collision = Math.max(0, game.collision - dt);

  const shore = resolveShoreCollision(game.x, game.z, game.heading);
  if (shore.hit) {
    game.x = shore.x;
    game.z = shore.z;
    game.velocityX = game.velocityZ = game.groundSpeed = game.waterSpeed = 0;
    game.speed = 0;
    game.collision = 2.5;
  }

  const fromCenter = Math.hypot(game.x, game.z);
  game.boundary = fromCenter >= WORLD_RADIUS - 25;
  if (fromCenter > WORLD_RADIUS) {
    game.x *= WORLD_RADIUS / fromCenter;
    game.z *= WORLD_RADIUS / fromCenter;
    game.velocityX = game.velocityZ = game.groundSpeed = game.waterSpeed = 0;
    game.speed = 0;
  }
  game.distance += Math.hypot(game.x - oldX, game.z - oldZ);
  game.maxSpeed = Math.max(game.maxSpeed, game.groundSpeed);

  const next = ROUTE[game.waypoint];
  if (next && Math.hypot(game.x - next.x, game.z - next.z) < BUOY_RADIUS) {
    game.waypoint++;
    if (game.waypoint === ROUTE.length) game.mode = 'finished';
  }
}

export function sailingHint(game) {
  const rig = rigPower(game);
  const key = rig.main.efficiency <= rig.jib.efficiency ? 'main' : 'jib';
  const sail = rig[key];
  const trim = game[`${key}Trim`];
  if (game.collision > 0) return { title: 'Осторожно, мелководье', detail: 'Поверни от берега и снова поймай ветер.', tone: 'warning' };
  if (game.boundary) return { title: 'Край архипелага', detail: 'Развернись к маршруту на карте.', tone: 'warning' };
  if (rig.drive < -0.03) return { title: 'Паруса тянут назад', detail: 'Яхта сначала погасит инерцию, затем пойдёт кормой вперёд. Руль работает наоборот.', tone: 'warning' };
  if (rig.power < 0.05 && game.groundSpeed > 0.08 && game.waterSpeed < 0.3) return { title: 'Дрейф по течению', detail: 'Вода несёт яхту. Поймай ветер, чтобы управлять ходом.', tone: 'good' };
  if (sail.angle < 35) return { title: 'Ветер прямо в нос', detail: 'Поверни влево или вправо, чтобы наполнить парус.', tone: 'warning' };
  if (sail.efficiency < MIN_TRIM_EFFICIENCY) return {
    title: `Переведи ${SAILS[key].label.toLowerCase()} ${trim > sail.idealTrim ? 'влево' : 'вправо'}`,
    detail: trim * sail.idealTrim < 0 ? 'Переведи этот парус через 0° на другой борт.' : 'Настрой его угол, второй парус останется на месте.', tone: 'warning',
  };
  return { title: 'Ты поймал ветер', detail: 'Держи курс на светящийся буй.', tone: 'good' };
}
