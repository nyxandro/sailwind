import * as THREE from 'three';
import { SAILS } from './world.js';

export function createRigging() {
  const group = new THREE.Group();
  group.name = 'sail-sheets';
  const material = new THREE.MeshStandardMaterial({ color: '#9a855f', roughness: 0.85 });
  const geometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
  const main = new THREE.Mesh(geometry, material);
  const jibPort = new THREE.Mesh(geometry, material);
  const jibStarboard = new THREE.Mesh(geometry, material);
  group.add(main, jibPort, jibStarboard);
  return { group, main, jibPort, jibStarboard };
}

function stretchRope(rope, from, to) {
  const direction = new THREE.Vector3().subVectors(to, from);
  rope.position.copy(from).add(to).multiplyScalar(0.5);
  rope.scale.y = direction.length();
  rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}

export function updateRigging(rigging, mainSail, jib) {
  mainSail.updateMatrix();
  jib.updateMatrix();
  const mainCorner = new THREE.Vector3(0, 0, SAILS.main.foot).applyMatrix4(mainSail.matrix);
  const { position, uv } = jib.geometry.attributes;
  const jibCorner = new THREE.Vector3();
  let foundClew = false;
  for (let i = 0; i < uv.count; i++) {
    if (uv.getX(i) !== 1 || uv.getY(i) !== 0) continue;
    jibCorner.fromBufferAttribute(position, i).applyMatrix4(jib.matrix);
    foundClew = true;
    break;
  }
  if (!foundClew) throw new Error('RIGGING_CLEW_MISSING: The jib geometry has no free lower corner for sheet attachment');
  stretchRope(rigging.main, mainCorner, new THREE.Vector3(0, 1.15, 3.9));
  stretchRope(rigging.jibPort, jibCorner, new THREE.Vector3(-1.65, 1.12, 1.65));
  stretchRope(rigging.jibStarboard, jibCorner, new THREE.Vector3(1.65, 1.12, 1.65));
}
