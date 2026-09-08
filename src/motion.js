import { clamp, radians, signedAngle } from './world.js';

export const YACHT_PHYSICS = {
  mass: 6400,
  referenceMass: 6800,
  airDensity: 1.225,
  sailCoefficient: 1.6,
  surgeLinearDrag: 240,
  surgeQuadraticDrag: 60,
  swayLinearDrag: 1800,
  swayQuadraticDrag: 700,
  reverseResistance: 2,
  reverseDrive: 0.45,
  yawResponse: 2.5,
  rudderResponse: 0.35,
  lowSpeedYaw: 3,
  yawPerSpeed: 3.2,
  heaveFrequency: 1.4,
  pitchFrequency: 1,
  rollFrequency: 0.85,
  referenceWindSpeed: 12,
  windHeelAtReference: radians(18),
  maxWindHeel: radians(24),
  maxWaveRoll: 0.12,
  maxRoll: radians(26),
};

export function windHeel(game, load) {
  const sidePressure = Math.sin(radians(signedAngle(game.windDirection, game.heading)));
  const pressure = (game.windSpeed / YACHT_PHYSICS.referenceWindSpeed) ** 2;
  const heel = sidePressure * clamp(load, 0, 1) * pressure * YACHT_PHYSICS.windHeelAtReference
    * YACHT_PHYSICS.referenceMass / YACHT_PHYSICS.mass;
  return clamp(heel, -YACHT_PHYSICS.maxWindHeel, YACHT_PHYSICS.maxWindHeel);
}

export function integrateMotion(game, rudder, driveForce, current, delta) {
  const dt = clamp(delta, 0, 0.1);
  let heading = radians(game.heading);
  const initialSurge = (game.velocityX - current.x) * Math.sin(heading) - (game.velocityZ - current.z) * Math.cos(heading);
  game.rudder += (rudder - game.rudder) * (1 - Math.exp(-dt / YACHT_PHYSICS.rudderResponse));
  // Small low-speed steerage remains a game assist; sternway reverses the rudder response.
  const turnSign = initialSurge < -0.15 ? -1 : 1;
  const desiredYaw = game.rudder * (YACHT_PHYSICS.lowSpeedYaw + Math.min(5, Math.abs(initialSurge)) * YACHT_PHYSICS.yawPerSpeed) * turnSign;
  const yawResponse = YACHT_PHYSICS.yawResponse * YACHT_PHYSICS.mass / YACHT_PHYSICS.referenceMass;
  game.yawRate += (desiredYaw - game.yawRate) * (1 - Math.exp(-dt / yawResponse));
  game.heading = (game.heading + game.yawRate * dt + 360) % 360;
  heading = radians(game.heading);
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = Math.sin(heading);
  const relativeX = game.velocityX - current.x;
  const relativeZ = game.velocityZ - current.z;
  const surge = relativeX * fx + relativeZ * fz;
  const sway = relativeX * rx + relativeZ * rz;
  const resistance = surge < 0 ? YACHT_PHYSICS.reverseResistance : 1;
  const surgeDrag = (YACHT_PHYSICS.surgeLinearDrag * surge + YACHT_PHYSICS.surgeQuadraticDrag * surge * Math.abs(surge)) * resistance;
  const swayDrag = YACHT_PHYSICS.swayLinearDrag * sway + YACHT_PHYSICS.swayQuadraticDrag * sway * Math.abs(sway);
  game.velocityX += ((driveForce - surgeDrag) * fx - swayDrag * rx) / YACHT_PHYSICS.mass * dt;
  game.velocityZ += ((driveForce - surgeDrag) * fz - swayDrag * rz) / YACHT_PHYSICS.mass * dt;
  game.speed = (game.velocityX - current.x) * fx + (game.velocityZ - current.z) * fz;
  game.waterSpeed = Math.hypot(game.velocityX - current.x, game.velocityZ - current.z);
  game.groundSpeed = Math.hypot(game.velocityX, game.velocityZ);
  game.currentX = current.x;
  game.currentZ = current.z;
}
