import * as THREE from 'three';
import { SAILS, radians } from './world.js';
import { createClothGeometry, clothBulge } from './sail-cloth.js';

export function createJib() {
  const geometry = createClothGeometry();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#f7f4df', side: THREE.DoubleSide, roughness: 0.8 }));
  mesh.position.set(0, 1.7, -1.2 - SAILS.jib.foot);
  mesh.castShadow = true;
  updateJib(mesh, 0, 0, 0, 0);
  return mesh;
}

export function updateJib(jib, trim, load, time, relativeWind) {
  const { position, uv } = jib.geometry.attributes;
  const angle = radians(trim);
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  for (let i = 0; i < position.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const foot = u * (1 - v) * SAILS.jib.foot;
    const curve = clothBulge(trim, load, u, v, time, SAILS.jib.foot, relativeWind);
    // The leading edge stays on the forestay; only the free corner and cloth move.
    position.setXYZ(i, foot * sin + curve * cos, v * SAILS.jib.height, v * SAILS.jib.foot + foot * cos - curve * sin);
  }
  position.needsUpdate = true;
  jib.geometry.computeVertexNormals();
  jib.geometry.computeBoundingSphere();
}
