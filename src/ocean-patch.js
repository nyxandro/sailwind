import { OCEAN_FIELD_STRIDE, writeOceanCoefficients, evaluateOceanCoefficients } from './ocean-field.js';
import {
  OCEAN_COORDINATES,
  OCEAN_STEP,
  OCEAN_HALF_SIZE,
  OCEAN_ANCHOR_STEP,
  OCEAN_DETAIL_FULL_RATIO,
  COARSE_OCEAN_COORDINATES,
  COARSE_OCEAN_INNER_SIZE,
  oceanTriangle,
} from './ocean-grid.js';
import { smoothstep } from './world.js';

export function createOceanPatch(coarseField, x, z, previous) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    x % OCEAN_ANCHOR_STEP !== 0 ||
    z % OCEAN_ANCHOR_STEP !== 0 ||
    Math.max(Math.abs(x), Math.abs(z)) + OCEAN_HALF_SIZE > COARSE_OCEAN_INNER_SIZE
  ) {
    throw new Error('OCEAN_PATCH_ANCHOR_INVALID: Requested patch must align with the world lattice inside the gameplay area');
  }
  const side = OCEAN_COORDINATES.length;
  const field = new Float32Array(side * side * OCEAN_FIELD_STRIDE);
  const coarseSamples = new Float32Array(field.length);
  const scratch = new Float64Array(40);
  const dx = previous ? (x - previous.x) / OCEAN_STEP : 0;
  const dz = previous ? (z - previous.z) / OCEAN_STEP : 0;
  for (let row = 0; row < side; row++) {
    const oldRow = row + dz;
    const reusable = previous && oldRow >= 0 && oldRow < side;
    const left = reusable ? Math.max(0, -dx) : 0;
    const right = reusable ? Math.min(side, side - dx) : 0;
    if (left < right) {
      const start = (oldRow * side + left + dx) * OCEAN_FIELD_STRIDE;
      const end = start + (right - left) * OCEAN_FIELD_STRIDE;
      const destination = (row * side + left) * OCEAN_FIELD_STRIDE;
      field.set(previous.field.subarray(start, end), destination);
      coarseSamples.set(previous.coarseSamples.subarray(start, end), destination);
    }
    for (let col = 0; col < side; col++) {
      if (col >= left && col < right) continue;
      const worldX = OCEAN_COORDINATES[col] + x;
      const worldZ = OCEAN_COORDINATES[row] + z;
      const start = (row * side + col) * OCEAN_FIELD_STRIDE;
      writeOceanCoefficients(worldX, worldZ, field, start, scratch);
      const { vertices, weights } = oceanTriangle(COARSE_OCEAN_COORDINATES, worldX, worldZ);
      const [a, b, c] = vertices.map((vertex) => vertex * OCEAN_FIELD_STRIDE);
      for (let component = 0; component < OCEAN_FIELD_STRIDE; component++) {
        coarseSamples[start + component] =
          0 + coarseField[a + component] * weights[0] + coarseField[b + component] * weights[1] + coarseField[c + component] * weights[2];
      }
    }
  }
  return { x, z, field, coarseSamples };
}

export function oceanDetailWeight(x, z, detail) {
  return detail.radius > 0
    ? 1 - smoothstep(detail.radius * OCEAN_DETAIL_FULL_RATIO, detail.radius, Math.hypot(x - detail.x, z - detail.z))
    : 0;
}

export function sampleOceanSurface(patch, coarseField, detail, x, z, clock) {
  const near = Math.abs(x - patch.x) <= OCEAN_HALF_SIZE && Math.abs(z - patch.z) <= OCEAN_HALF_SIZE;
  const coordinates = near ? OCEAN_COORDINATES : COARSE_OCEAN_COORDINATES;
  const triangle = oceanTriangle(coordinates, near ? x - patch.x : x, near ? z - patch.z : z);
  return triangle.vertices.reduce((height, vertex, i) => {
    if (!near) return height + evaluateOceanCoefficients(coarseField, vertex, clock).height * triangle.weights[i];
    const worldX = coordinates[vertex % coordinates.length] + patch.x;
    const worldZ = coordinates[Math.floor(vertex / coordinates.length)] + patch.z;
    const detailWeight = oceanDetailWeight(worldX, worldZ, detail);
    const coarse = evaluateOceanCoefficients(patch.coarseSamples, vertex, clock).height;
    const fine = evaluateOceanCoefficients(patch.field, vertex, clock).height;
    return height + (coarse * (1 - detailWeight) + fine * detailWeight) * triangle.weights[i];
  }, 0);
}
