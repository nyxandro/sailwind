export const OCEAN_STEP = 1;
export const OCEAN_HALF_SIZE = 128;
export const OCEAN_ANCHOR_STEP = 8;
export const OCEAN_DETAIL_RADIUS = 96;
export const OCEAN_DETAIL_FULL_RATIO = 0.5;
export const OCEAN_SEGMENTS = (OCEAN_HALF_SIZE * 2) / OCEAN_STEP;
export const OCEAN_COORDINATES = Float32Array.from({ length: OCEAN_SEGMENTS + 1 }, (_, i) => -OCEAN_HALF_SIZE + i * OCEAN_STEP);

export const COARSE_OCEAN_STEP = 8;
export const COARSE_OCEAN_INNER_SIZE =
  Math.ceil((WORLD_RADIUS + OCEAN_HALF_SIZE + 2 * OCEAN_ANCHOR_STEP) / COARSE_OCEAN_STEP) * COARSE_OCEAN_STEP;
const OUTER_SEGMENTS = 16;
const OUTER_STEP = 100;
export const COARSE_OCEAN_COORDINATES = Float32Array.from([
  ...Array.from({ length: OUTER_SEGMENTS }, (_, i) => -COARSE_OCEAN_INNER_SIZE - (OUTER_SEGMENTS - i) * OUTER_STEP),
  ...Array.from(
    { length: (COARSE_OCEAN_INNER_SIZE * 2) / COARSE_OCEAN_STEP + 1 },
    (_, i) => -COARSE_OCEAN_INNER_SIZE + i * COARSE_OCEAN_STEP,
  ),
  ...Array.from({ length: OUTER_SEGMENTS }, (_, i) => COARSE_OCEAN_INNER_SIZE + (i + 1) * OUTER_STEP),
]);

export function oceanTriangle(coordinates, x, z) {
  const last = coordinates.length - 1;
  const cells = [];
  for (const value of [x, z]) {
    if (!Number.isFinite(value) || value < coordinates[0] || value > coordinates[last]) {
      throw new Error('OCEAN_SAMPLE_OUT_OF_RANGE: Requested point is outside the water mesh');
    }
    let low = 0;
    let high = last;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (coordinates[mid] <= value) low = mid;
      else high = mid;
    }
    cells.push(low);
  }
  const [col, row] = cells;
  const u = (x - coordinates[col]) / (coordinates[col + 1] - coordinates[col]);
  const v = (z - coordinates[row]) / (coordinates[row + 1] - coordinates[row]);
  const a = row * coordinates.length + col;
  const b = a + coordinates.length;
  return u + v <= 1
    ? { vertices: [a, b, a + 1], weights: [1 - u - v, v, u] }
    : { vertices: [b, a + 1, b + 1], weights: [1 - u, 1 - v, u + v - 1] };
}
import { WORLD_RADIUS } from './world.js';
