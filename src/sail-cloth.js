import * as THREE from 'three';
import { SAILS, radians, clamp } from './world.js';

export function createClothGeometry() {
  const segments = 22;
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      uvs.push(col / segments, row / segments);
      if (row === segments || col === segments) continue;
      const a = row * (segments + 1) + col;
      indices.push(a, a + 1, a + segments + 1, a + 1, a + segments + 2, a + segments + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(uvs.length / 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(uvs.length / 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export function clothBulge(trim, load, u, v, time, foot, relativeWind) {
  const fill = Math.sqrt(clamp(load, 0, 1));
  const side = Math.tanh(Math.sin(radians(relativeWind - trim)) * 6);
  const flutter = (1 - fill) * Math.sin(time * 11 + u * 9 + v * 6) * 0.12;
  // Every attached edge stays fixed. Only the middle of the cloth catches the wind.
  return Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * (side * fill * foot * 0.34 + flutter);
}

export function createMainCloth(material) {
  const mesh = new THREE.Mesh(createClothGeometry(), material);
  mesh.castShadow = true;
  updateMainCloth(mesh, 0, 0, 0, 0);
  return mesh;
}

export function updateMainCloth(mesh, trim, load, time, relativeWind) {
  const { position, uv } = mesh.geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    position.setXYZ(i, clothBulge(trim, load, u, v, time, SAILS.main.foot, relativeWind), v * SAILS.main.height, u * (1 - v) * SAILS.main.foot);
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}
