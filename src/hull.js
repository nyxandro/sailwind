import * as THREE from 'three';

function geometryFrom(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createHull() {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f6f1de', roughness: 0.42 });
  const antifouling = new THREE.MeshStandardMaterial({ color: '#101c24', roughness: 0.64 });
  const stations = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.035, 0.08, -6), new THREE.Vector3(0.68, 0.4, -5.25),
    new THREE.Vector3(1.32, 0.83, -4.1), new THREE.Vector3(1.84, 1.2, -2.5),
    new THREE.Vector3(2.05, 1.35, -0.5), new THREE.Vector3(2.03, 1.3, 1.2),
    new THREE.Vector3(1.82, 1.05, 3), new THREE.Vector3(1.42, 0.43, 4.95),
  ]);
  const sections = 64;
  const around = 28;
  const profiles = Array.from({ length: sections + 1 }, (_, i) => stations.getPoint(i / sections));
  const wetPositions = [];
  const wetIndices = [];
  profiles.forEach((p, row) => {
    for (let j = 0; j <= around; j++) {
      const angle = -Math.PI / 2 + j / around * Math.PI;
      wetPositions.push(p.x * Math.sin(angle), -p.y * Math.cos(angle), p.z);
      if (row === sections || j === around) continue;
      const a = row * (around + 1) + j;
      const b = a + around + 1;
      wetIndices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  });
  for (const row of [0, sections]) {
    const centre = wetPositions.length / 3;
    wetPositions.push(0, 0, profiles[row].z);
    for (let j = 0; j < around; j++) {
      const a = row * (around + 1) + j;
      if (row === 0) wetIndices.push(centre, a + 1, a);
      else wetIndices.push(centre, a, a + 1);
    }
  }
  const underwater = new THREE.Mesh(geometryFrom(wetPositions, wetIndices), antifouling);
  underwater.name = 'hull-underwater';
  underwater.castShadow = true;
  underwater.receiveShadow = true;
  group.add(underwater);

  const sides = [];
  const sideIndices = [];
  for (const side of [-1, 1]) {
    const start = sides.length / 3;
    profiles.forEach((p, row) => {
      sides.push(side * p.x, 0, p.z, side * p.x * 1.015, 1, p.z);
      if (row === sections) return;
      const a = start + row * 2;
      if (side > 0) sideIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else sideIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    });
  }
  for (const row of [0, sections]) {
    const p = profiles[row];
    const a = sides.length / 3;
    sides.push(-p.x, 0, p.z, p.x, 0, p.z, p.x * 1.015, 1, p.z, -p.x * 1.015, 1, p.z);
    if (row === sections) sideIndices.push(a, a + 1, a + 3, a + 1, a + 2, a + 3);
    else sideIndices.push(a, a + 3, a + 1, a + 1, a + 3, a + 2);
  }
  const topsides = new THREE.Mesh(geometryFrom(sides, sideIndices), white);
  topsides.name = 'hull-topsides';
  topsides.castShadow = topsides.receiveShadow = true;
  group.add(topsides);

  const outlinePoints = profiles.map((p) => new THREE.Vector2(p.x * 1.015, -p.z));
  outlinePoints.push(...profiles.toReversed().map((p) => new THREE.Vector2(-p.x * 1.015, -p.z)));
  const deckOutline = new THREE.Shape(outlinePoints);
  const rimShape = new THREE.Shape(outlinePoints);
  rimShape.holes.push(new THREE.Path(outlinePoints.toReversed().map((p) => p.clone().multiplyScalar(0.94))));
  const rim = new THREE.Mesh(new THREE.ShapeGeometry(rimShape), white);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 1.005;
  group.add(rim);

  const keelShape = new THREE.Shape();
  keelShape.moveTo(-0.95, -1.05); keelShape.lineTo(1.2, -1.05); keelShape.lineTo(0.85, -1.99); keelShape.lineTo(-0.05, -2.05); keelShape.closePath();
  const keelGeometry = new THREE.ExtrudeGeometry(keelShape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, steps: 1 });
  keelGeometry.rotateY(-Math.PI / 2); keelGeometry.translate(0.09, 0, 0.2);
  const keel = new THREE.Mesh(keelGeometry, antifouling);
  keel.name = 'keel';
  keel.castShadow = true;
  group.add(keel);
  const ballast = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), antifouling);
  ballast.scale.set(0.24, 0.18, 0.85); ballast.position.set(0, -2.05, 0.5); group.add(ballast);
  const rudder = new THREE.Group();
  rudder.name = 'rudder';
  rudder.position.set(0, -0.25, 4.55);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.22, 0); bladeShape.lineTo(0.45, -0.08); bladeShape.quadraticCurveTo(0.75, -1.4, 0.1, -1.6); bladeShape.quadraticCurveTo(-0.4, -1.3, -0.22, 0);
  const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, steps: 1 });
  bladeGeometry.rotateY(-Math.PI / 2); bladeGeometry.translate(0.06, 0, 0);
  rudder.add(new THREE.Mesh(bladeGeometry, antifouling));
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.7, 8), antifouling);
  stock.position.y = -0.3;
  rudder.add(stock);
  group.add(rudder);
  return { group, deckOutline, rudder };
}
