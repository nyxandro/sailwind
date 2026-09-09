import * as THREE from 'three';
import { SAILS, radians } from './world.js';
import { createClothGeometry, clothBulge } from './sail-cloth.js';
import { clothFold, validateHoist } from './hoist.js';
import { RIG_LAYOUT } from './yacht/rig-layout.js';

export function createJib() {
  const geometry = createClothGeometry();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#f7f4df', side: THREE.DoubleSide, roughness: 0.8 }));
  mesh.position.set(...RIG_LAYOUT.jibTack);
  mesh.castShadow = true;
  updateJib(mesh, 0, 0, 0, 0, 1);
  return mesh;
}

export function updateJib(jib, trim, load, time, relativeWind, hoist) {
  validateHoist(hoist);
  const { position, uv } = jib.geometry.attributes;
  const angle = radians(trim);
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  for (let i = 0; i < position.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const foot = u * (1 - v) * SAILS.jib.foot;
    const fold = clothFold(u, v, hoist);
    const curve = clothBulge(trim, load, u, v, time, SAILS.jib.foot, relativeWind) * hoist + fold.width;
    // The leading edge stays on the forestay; only the free corner and cloth move.
    position.setXYZ(i, foot * sin + curve * cos, v * SAILS.jib.height * hoist + fold.height, v * SAILS.jib.foot * hoist + foot * cos - curve * sin);
  }
  position.needsUpdate = true;
  jib.geometry.computeVertexNormals();
  jib.geometry.computeBoundingSphere();
}
