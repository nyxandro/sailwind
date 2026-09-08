import * as THREE from 'three';
import { waveHeight } from './waves.js';

const SEGMENTS = 128;
const COORDINATES = Float32Array.from({ length: SEGMENTS + 1 }, (_, i) => {
  const n = -1 + i * 2 / SEGMENTS;
  return n * 45 + n ** 3 * 1400;
});

export function createOceanGeometry() {
  const geometry = new THREE.PlaneGeometry(2, 2, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let row = 0; row <= SEGMENTS; row++) {
    for (let col = 0; col <= SEGMENTS; col++) position.setXYZ(row * (SEGMENTS + 1) + col, COORDINATES[col], 0, COORDINATES[row]);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

function cellAt(value) {
  if (value < COORDINATES[0] || value > COORDINATES[SEGMENTS]) throw new Error('OCEAN_SAMPLE_OUT_OF_RANGE: Floating object is outside the water mesh');
  let low = 0;
  let high = SEGMENTS;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (COORDINATES[mid] <= value) low = mid;
    else high = mid;
  }
  return low;
}

export function sampleOceanHeight(x, z, time, anchorX, anchorZ) {
  const col = cellAt(x - anchorX);
  const row = cellAt(z - anchorZ);
  const x0 = COORDINATES[col] + anchorX;
  const x1 = COORDINATES[col + 1] + anchorX;
  const z0 = COORDINATES[row] + anchorZ;
  const z1 = COORDINATES[row + 1] + anchorZ;
  const u = (x - x0) / (x1 - x0);
  const v = (z - z0) / (z1 - z0);
  const b = waveHeight(x0, z1, time);
  const d = waveHeight(x1, z0, time);
  // Match PlaneGeometry's actual triangle diagonal, not the continuous wave above it.
  if (u + v <= 1) return waveHeight(x0, z0, time) * (1 - u - v) + b * v + d * u;
  return b * (1 - u) + d * (1 - v) + waveHeight(x1, z1, time) * (u + v - 1);
}
