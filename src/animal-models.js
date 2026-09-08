import * as THREE from 'three';

function ellipsoid(parent, material, size, position) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), material);
  mesh.scale.set(...size);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function fin(parent, material, points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  return mesh;
}

export function createAnimal(kind) {
  const root = new THREE.Group();
  const eyes = new THREE.MeshStandardMaterial({ color: '#152a2b', roughness: 0.3 });
  const tail = new THREE.Group();
  root.add(tail);
  if (kind === 'dolphin') {
    const skin = new THREE.MeshStandardMaterial({ color: '#6f9ca5', roughness: 0.28, metalness: 0.08, side: THREE.DoubleSide });
    const belly = new THREE.MeshStandardMaterial({ color: '#cadbd4', roughness: 0.45 });
    ellipsoid(root, skin, [0.48, 0.5, 1.65], [0, 0, 0]);
    ellipsoid(root, belly, [0.38, 0.24, 1.35], [0, -0.24, -0.1]);
    ellipsoid(root, skin, [0.2, 0.16, 0.62], [0, -0.03, -1.65]);
    for (const side of [-1, 1]) {
      ellipsoid(root, eyes, [0.055, 0.055, 0.055], [side * 0.29, 0.12, -1.17]);
      fin(root, skin, [[side * 0.35, -0.14, -0.5], [side * 1.1, -0.28, 0.35], [side * 0.4, -0.22, 0.55]]);
      fin(tail, skin, [[0, 0, 0], [side * 0.85, 0.06, 0.55], [side * 0.13, 0, 0.44]]);
    }
    fin(root, skin, [[0, 0.38, -0.1], [0, 1.12, 0.65], [0, 0.36, 0.85]]);
    tail.position.z = 1.5;
  } else if (kind === 'fish') {
    const skin = new THREE.MeshStandardMaterial({ color: '#b4d7cc', roughness: 0.35, metalness: 0.25, side: THREE.DoubleSide });
    const orange = new THREE.MeshStandardMaterial({ color: '#d0a871', roughness: 0.6, side: THREE.DoubleSide });
    ellipsoid(root, skin, [0.16, 0.25, 0.65], [0, 0, 0]);
    for (const side of [-1, 1]) ellipsoid(root, eyes, [0.035, 0.035, 0.035], [side * 0.13, 0.07, -0.4]);
    fin(root, orange, [[0, 0.2, -0.15], [0, 0.52, 0.16], [0, 0.17, 0.4]]);
    fin(tail, orange, [[0, 0, 0], [0, 0.35, 0.43], [0, 0, 0.3]]);
    fin(tail, orange, [[0, 0, 0], [0, 0, 0.3], [0, -0.35, 0.43]]);
    tail.position.z = 0.55;
  } else {
    throw new Error(`MARINE_SPECIES_INVALID: Unsupported animal kind ${kind}`);
  }
  return { root, tail };
}
