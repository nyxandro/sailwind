import { clamp } from './world.js';

// A full raise/lower takes five seconds of simulation time.
const HOIST_RATE = 1 / 5;
const FOLD_WIDTH = 0.22;
const FOLD_HEIGHT = 0.16;
const FOLD_COUNT = 5;

export function validateHoist(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('SAIL_HOIST_INVALID: Sail height must be a number between 0 and 1');
  }
  return value;
}

export function advanceHoists(game, dt) {
  for (const key of ['main', 'jib']) {
    validateHoist(game[`${key}Hoist`]);
    validateHoist(game[`${key}HoistTarget`]);
  }
  for (const key of ['main', 'jib']) {
    const current = game[`${key}Hoist`];
    const target = game[`${key}HoistTarget`];
    game[`${key}Hoist`] = Math.abs(target - current) <= HOIST_RATE * dt
      ? target : current + clamp(target - current, -HOIST_RATE * dt, HOIST_RATE * dt);
  }
}

// Gather cloth above the foot while keeping all attachment edges fixed.
export function clothFold(u, v, hoist) {
  const gathered = (1 - hoist) * Math.sin(Math.PI * u);
  return {
    width: gathered * FOLD_WIDTH * Math.sin(v * Math.PI * 2 * FOLD_COUNT),
    height: gathered * FOLD_HEIGHT * Math.sin(Math.PI * v),
  };
}
