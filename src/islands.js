import * as THREE from 'three';
import { coastRadius, smoothstep, islandHeightAt } from './world.js';

function palmGeometry() {
  const trunk = new THREE.CylinderGeometry(0.14, 0.3, 6, 8, 12);
  trunk.translate(0, 3, 0);
  const positions = trunk.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setX(i, positions.getX(i) + (positions.getY(i) / 6) ** 2 * 1.25);
  trunk.computeVertexNormals();
  const leaves = [];
  const colors = [];
  const indices = [];
  const dark = new THREE.Color('#2e6041');
  const light = new THREE.Color('#668c49');
  for (let leaf = 0; leaf < 7; leaf++) {
    const angle = leaf / 7 * Math.PI * 2;
    const start = leaves.length / 3;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const width = Math.sin(t * Math.PI) * 0.55 * (i % 2 ? 0.8 : 1);
      const distance = t * (3.8 + leaf % 2 * 0.5);
      const y = 6 + Math.sin(t * Math.PI) * 0.85 - t * t * 1.45;
      for (const side of [-1, 1]) {
        leaves.push(1.25 + Math.cos(angle) * distance + Math.sin(angle) * width * side, y, Math.sin(angle) * distance - Math.cos(angle) * width * side);
        const c = dark.clone().lerp(light, t * 0.65 + (side > 0 ? 0.1 : 0));
        colors.push(c.r, c.g, c.b);
      }
      if (i < 12) { const a = start + i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const fronds = new THREE.BufferGeometry();
  fronds.setAttribute('position', new THREE.Float32BufferAttribute(leaves, 3));
  fronds.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  fronds.setIndex(indices); fronds.computeVertexNormals();
  return { trunk, fronds };
}

export function createIsland(island, index) {
  const group = new THREE.Group();
  group.position.set(island.x, 0, island.z);
  const radial = 36;
  const segments = 96;
  const positions = [];
  const colors = [];
  const indices = [];
  const sand = new THREE.Color('#d8c59c');
  const wetSand = new THREE.Color('#aa9c7b');
  const grass = new THREE.Color('#688358');
  const stone = new THREE.Color('#81877c');
  for (let row = 0; row <= radial; row++) {
    for (let col = 0; col <= segments; col++) {
      const angle = col / segments * Math.PI * 2;
      const distance = row / radial * 1.25 * coastRadius(island, angle);
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const height = islandHeightAt(island, x, z);
      positions.push(x, height, z);
      const c = wetSand.clone().lerp(sand, smoothstep(-0.5, 1.8, height));
      c.lerp(grass, smoothstep(1.8, 4.3, height));
      c.lerp(stone, smoothstep(0.4, 0.85, Math.sin(x * 0.16 + index) * Math.cos(z * 0.14)) * smoothstep(3, 8, height) * 0.8);
      c.multiplyScalar(0.92 + Math.sin(x * 0.6 + z * 0.4) * Math.sin(z * 0.3) * 0.06);
      colors.push(c.r, c.g, c.b);
      if (row < radial && col < segments) {
        const a = row * (segments + 1) + col;
        const b = a + segments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  terrain.name = 'island-terrain';
  terrain.castShadow = terrain.receiveShadow = true;
  group.add(terrain);
  const palm = palmGeometry();
  const trunks = new THREE.InstancedMesh(palm.trunk, new THREE.MeshStandardMaterial({ color: '#897158', roughness: 1 }), 14);
  const fronds = new THREE.InstancedMesh(palm.fronds, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }), 14);
  fronds.name = 'palm-fronds';
  trunks.castShadow = fronds.castShadow = true;
  const transform = new THREE.Object3D();
  for (let i = 0; i < 14; i++) {
    const angle = i * 2.39996 + index * 1.8;
    const radius = coastRadius(island, angle) * (0.52 + (Math.sin(i * 11.2) * 0.5 + 0.5) * 0.3);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    transform.position.set(x, islandHeightAt(island, x, z) - 0.1, z);
    transform.rotation.y = angle;
    transform.scale.setScalar(0.75 + (i % 4) * 0.13);
    transform.updateMatrix();
    trunks.setMatrixAt(i, transform.matrix); fronds.setMatrixAt(i, transform.matrix);
  }
  const rockGeometry = new THREE.IcosahedronGeometry(1, 2);
  const rockPositions = rockGeometry.attributes.position;
  for (let i = 0; i < rockPositions.count; i++) {
    const x = rockPositions.getX(i), y = rockPositions.getY(i), z = rockPositions.getZ(i);
    const shape = 1 + 0.12 * Math.sin(x * 8 + y * 3) * Math.cos(z * 7);
    rockPositions.setXYZ(i, x * shape, y * shape, z * shape);
  }
  rockGeometry.computeVertexNormals();
  const rocks = new THREE.InstancedMesh(rockGeometry, new THREE.MeshStandardMaterial({ color: '#91948a', roughness: 0.96 }), 12);
  rocks.name = 'coastal-rocks';
  rocks.castShadow = rocks.receiveShadow = true;
  for (let i = 0; i < 12; i++) {
    const angle = i * 2.39996 + index;
    const radius = coastRadius(island, angle) * (0.65 + (i % 3) * 0.06);
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const size = 1.5 + (i % 4) * 0.6;
    transform.position.set(x, islandHeightAt(island, x, z) + size * 0.35, z);
    transform.scale.set(size, size * 0.65, size * 0.8);
    transform.rotation.set(i * 0.13, angle, i * 0.23); transform.updateMatrix();
    rocks.setMatrixAt(i, transform.matrix);
  }
  for (const mesh of [trunks, fronds, rocks]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); group.add(mesh); }
  if (island.lighthouse) {
    const tower = new THREE.Group();
    tower.position.y = islandHeightAt(island, 0, 0);
    const white = new THREE.MeshStandardMaterial({ color: '#f3efdc', roughness: 0.8 });
    const teal = new THREE.MeshStandardMaterial({ color: '#335952', roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const section = new THREE.Mesh(new THREE.CylinderGeometry(1.6 - i * 0.15, 1.8 - i * 0.15, 3, 24), i === 1 ? teal : white);
      section.position.y = i * 3 + 1.5; section.castShadow = true; tower.add(section);
    }
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.8, 16), new THREE.MeshStandardMaterial({ color: '#dfdbc0', emissive: '#9b8b54', emissiveIntensity: 0.35 }));
    lantern.position.y = 9.8; tower.add(lantern);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2, 1.5, 24), teal);
    roof.position.y = 11.4; tower.add(roof); group.add(tower);
  }
  return group;
}
