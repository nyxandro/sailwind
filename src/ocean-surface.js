import * as THREE from 'three';
import { WAVES } from './waves.js';
import { OCEAN_COORDINATES, COARSE_OCEAN_COORDINATES, OCEAN_HALF_SIZE, oceanTriangle } from './ocean-grid.js';

export function createOceanGeometry(coordinates = OCEAN_COORDINATES) {
  const SEGMENTS = coordinates.length - 1;
  const geometry = new THREE.PlaneGeometry(2, 2, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let row = 0; row <= SEGMENTS; row++) {
    for (let col = 0; col <= SEGMENTS; col++) position.setXYZ(row * (SEGMENTS + 1) + col, coordinates[col], 0, coordinates[row]);
  }
  geometry.computeBoundingSphere();
  // CPU positions are flat; include the displacement performed by the shader.
  geometry.boundingSphere.radius += WAVES.reduce((height, wave) => height + wave.amplitude, 0);
  return geometry;
}

export function sampleOceanHeight(x, z, anchorX, anchorZ, sample, coordinates = OCEAN_COORDINATES) {
  const { vertices, weights } = oceanTriangle(coordinates, x - anchorX, z - anchorZ);
  return vertices.reduce((height, vertex, i) => height + sample(vertex) * weights[i], 0);
}

export function createFarOceanIndices(x, z) {
  const coordinates = COARSE_OCEAN_COORDINATES;
  const lowX = coordinates.indexOf(x - OCEAN_HALF_SIZE);
  const highX = coordinates.indexOf(x + OCEAN_HALF_SIZE);
  const lowZ = coordinates.indexOf(z - OCEAN_HALF_SIZE);
  const highZ = coordinates.indexOf(z + OCEAN_HALF_SIZE);
  if ([lowX, highX, lowZ, highZ].some((i) => i < 0))
    throw new Error('OCEAN_PATCH_ALIGNMENT_FAILED: Near water must align with the far-water grid');
  const side = coordinates.length;
  const cells = (side - 1) ** 2 - (highX - lowX) * (highZ - lowZ);
  const indices = new Uint32Array(cells * 6);
  let offset = 0;
  for (let row = 0; row < side - 1; row++) {
    for (let col = 0; col < side - 1; col++) {
      if (row >= lowZ && row < highZ && col >= lowX && col < highX) continue;
      const a = row * side + col;
      const b = a + side;
      indices[offset++] = a;
      indices[offset++] = b;
      indices[offset++] = a + 1;
      indices[offset++] = b;
      indices[offset++] = b + 1;
      indices[offset++] = a + 1;
    }
  }
  return indices;
}
