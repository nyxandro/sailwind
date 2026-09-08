import * as THREE from 'three';
import { ISLANDS, clamp, shoreDistance } from './world.js';
import { applyDepthShadows } from './depth-shadows.js';

export const MAX_SEABED_DEPTH = 60;
export const DEPTH_MAP_WORLD_SIZE = 2000;
export const REEFS = [
  { x: 24, z: -32, radius: 44 },
  { x: 104, z: -145, radius: 48 },
  { x: 245, z: -180, radius: 46 },
  { x: 145, z: -5, radius: 44 },
  { x: -45, z: 75, radius: 50 },
];
const SEGMENTS = 256;
const COORDINATES = Float32Array.from({ length: SEGMENTS + 1 }, (_, i) => {
  const n = -1 + i * 2 / SEGMENTS;
  return n * 900 + n ** 7 * 1600;
});
const CORAL_COLORS = ['#ce7977', '#dda652', '#b17bba', '#5baa99', '#d28d60'];
const smooth = (a, b, n) => {
  const t = clamp((n - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hash = (x, z) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

function noise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const u = smooth(0, 1, x - ix);
  const v = smooth(0, 1, z - iz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u), THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}

export function sampleSeabed(x, z) {
  const variation = noise(x * 0.12, z * 0.12);
  const channelX = Math.sin(z * 0.008) * 65 - 80;
  const channel = Math.exp(-(((x - channelX) / 58) ** 2));
  let depth = 18 + noise(x * 0.006, z * 0.006) * 14 + channel * 25;
  let reef = 0;
  let onLand = false;
  for (const island of ISLANDS) {
    const shore = shoreDistance(x, z, island);
    onLand ||= shore < 4;
    depth = Math.min(depth, 5 + (depth - 5) * smooth(4, 100, shore));
  }
  for (const patch of REEFS) {
    const distance = Math.hypot(x - patch.x, z - patch.z);
    const edge = (noise(x * 0.06, z * 0.06) - 0.5) * 8;
    const influence = 1 - smooth(patch.radius * 0.22, patch.radius, distance + edge);
    reef = Math.max(reef, influence);
    depth = THREE.MathUtils.lerp(depth, 5.5 + variation * 0.9, influence);
  }
  const offshore = smooth(700, 1000, Math.max(Math.abs(x), Math.abs(z)));
  depth = THREE.MathUtils.lerp(depth, MAX_SEABED_DEPTH, offshore);
  return { depth: clamp(depth, 5, MAX_SEABED_DEPTH), reef: onLand ? 0 : reef, variation };
}

export function createSeabed() {
  const group = new THREE.Group();
  group.name = 'seabed';
  const geometry = new THREE.PlaneGeometry(2, 2, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new THREE.Float32BufferAttribute(new Float32Array(position.count * 3), 3);
  const sand = new THREE.Color('#b6c5a6');
  const shelf = new THREE.Color('#297e92');
  const deep = new THREE.Color('#08224a');
  const palette = CORAL_COLORS.map((color) => new THREE.Color(color));
  const color = new THREE.Color();
  for (let row = 0; row <= SEGMENTS; row++) {
    for (let col = 0; col <= SEGMENTS; col++) {
      const x = COORDINATES[col];
      const z = COORDINATES[row];
      const sample = sampleSeabed(x, z);
      const i = row * (SEGMENTS + 1) + col;
      position.setXYZ(i, x, -sample.depth, z);
      color.copy(sand).lerp(shelf, smooth(7, 26, sample.depth)).lerp(deep, smooth(24, MAX_SEABED_DEPTH, sample.depth));
      const patchColor = palette[Math.min(palette.length - 1, Math.floor(sample.variation * palette.length))];
      color.lerp(patchColor, sample.reef * smooth(0.28, 0.7, sample.variation) * 0.7);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
  }
  geometry.setAttribute('color', colors);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const floor = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  applyDepthShadows(floor.material);
  floor.name = 'seabed-terrain';
  floor.receiveShadow = true;
  group.add(floor);

  const cellAt = (value) => {
    if (value < COORDINATES[0] || value > COORDINATES[SEGMENTS]) throw new Error('SEABED_SAMPLE_OUT_OF_RANGE: Requested point is outside the seabed');
    let low = 0;
    let high = SEGMENTS;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (COORDINATES[mid] <= value) low = mid;
      else high = mid;
    }
    return low;
  };
  const heightAt = (x, z) => {
    const col = cellAt(x);
    const row = cellAt(z);
    const u = (x - COORDINATES[col]) / (COORDINATES[col + 1] - COORDINATES[col]);
    const v = (z - COORDINATES[row]) / (COORDINATES[row + 1] - COORDINATES[row]);
    const a = row * (SEGMENTS + 1) + col;
    const b = a + SEGMENTS + 1;
    // Optical depth and coral roots use the rendered triangles, not an approximation above them.
    if (u + v <= 1) return position.getY(a) * (1 - u - v) + position.getY(b) * v + position.getY(a + 1) * u;
    return position.getY(b) * (1 - u) + position.getY(a + 1) * (1 - v) + position.getY(b + 1) * (u + v - 1);
  };

  const mapSize = 512;
  const data = new Uint8Array(mapSize * mapSize * 4);
  for (let row = 0; row < mapSize; row++) {
    for (let col = 0; col < mapSize; col++) {
      const x = ((col + 0.5) / mapSize - 0.5) * DEPTH_MAP_WORLD_SIZE;
      const z = ((row + 0.5) / mapSize - 0.5) * DEPTH_MAP_WORLD_SIZE;
      const i = (row * mapSize + col) * 4;
      data[i + 1] = Math.round(-heightAt(x, z) / MAX_SEABED_DEPTH * 255);
      data[i + 3] = 255;
    }
  }
  const depthMap = new THREE.DataTexture(data, mapSize, mapSize);
  depthMap.minFilter = depthMap.magFilter = THREE.LinearFilter;
  depthMap.needsUpdate = true;

  const attempts = 220;
  const shapes = [new THREE.IcosahedronGeometry(1, 1), new THREE.CylinderGeometry(0.16, 0.3, 1, 7), new THREE.SphereGeometry(1, 12, 6)];
  const corals = shapes.map((shape, i) => {
    shape.computeBoundingBox();
    const bottom = shape.boundingBox.min.y;
    const height = shape.boundingBox.max.y - bottom;
    shape.translate(0, -bottom, 0);
    shape.scale(1, 1 / height, 1);
    const mesh = new THREE.InstancedMesh(shape, new THREE.MeshStandardMaterial({ roughness: 0.85 }), REEFS.length * attempts);
    mesh.name = ['reef-mounds', 'reef-fingers', 'reef-tables'][i];
    mesh.count = 0;
    return mesh;
  });
  const transform = new THREE.Object3D();
  for (const [patchIndex, patch] of REEFS.entries()) {
    for (let i = 0; i < attempts; i++) {
      const angle = hash(i + 1, patchIndex + 7) * Math.PI * 2;
      const radius = Math.sqrt(hash(i + 21, patchIndex + 4)) * patch.radius * 0.65;
      const x = patch.x + Math.cos(angle) * radius;
      const z = patch.z + Math.sin(angle) * radius;
      const sample = sampleSeabed(x, z);
      if (sample.reef < 0.68 || sample.depth > 13) continue;
      const base = heightAt(x, z);
      if (Math.abs(heightAt(x + 1, z) - base) > 0.6 || Math.abs(heightAt(x, z + 1) - base) > 0.6) continue;
      const type = Math.floor(hash(i + 43, patchIndex + 19) * corals.length);
      const mesh = corals[type];
      const width = 0.7 + hash(i + 16, patchIndex + 29) * 1.2;
      const height = type === 2 ? 0.25 + width * 0.15 : 0.6 + hash(i + 52, patchIndex + 3) * 1.4;
      transform.position.set(x, base - 0.12, z);
      transform.scale.set(width, height, width * 0.85);
      transform.rotation.y = angle;
      transform.updateMatrix();
      mesh.setMatrixAt(mesh.count, transform.matrix);
      mesh.setColorAt(mesh.count, palette[Math.floor(hash(i + 4, patchIndex + 37) * palette.length)]);
      mesh.count++;
    }
  }
  for (const mesh of corals) {
    if (mesh.count === 0) {
      mesh.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
      continue;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return { group, depthMap, heightAt };
}
