import * as THREE from 'three';
import { radians, SAILS } from './world.js';
import { createJib, updateJib } from './jib.js';
import { createMainCloth, updateMainCloth } from './sail-cloth.js';
import { createRigging, updateRigging } from './rigging.js';
import { createHull } from './hull.js';

const cream = new THREE.MeshStandardMaterial({ color: '#fff9e8', roughness: 0.65 });
const teak = new THREE.MeshStandardMaterial({ color: '#b99469', roughness: 0.9 });
const dark = new THREE.MeshStandardMaterial({ color: '#214f52', roughness: 0.4 });
const metal = new THREE.MeshStandardMaterial({ color: '#c6ccc4', metalness: 0.5, roughness: 0.4 });

function line(points, color = '#627b77', opacity = 1) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p))),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
}

function box(parent, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function sailTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('SAIL_TEXTURE_FAILED: Canvas 2D is unavailable');
  ctx.fillStyle = '#fffbed';
  ctx.fillRect(0, 0, 512, 1024);
  ctx.strokeStyle = '#d9d7c5';
  ctx.lineWidth = 2;
  for (let y = 100; y < 1024; y += 130) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y + 40);
    ctx.stroke();
  }
  ctx.fillStyle = '#265d5d';
  ctx.fillRect(0, 760, 512, 100);
  ctx.fillStyle = '#bcd285';
  ctx.fillRect(0, 745, 512, 12);
  ctx.fillStyle = '#3b6260';
  ctx.font = '500 62px sans-serif';
  ctx.fillText('SW', 32, 350);
  ctx.font = '400 42px sans-serif';
  ctx.fillText('01', 34, 410);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function setSailTrim(yacht, mainTrim, jibTrim, loads, time, relativeWind, hoists) {
  const angle = radians(mainTrim);
  yacht.mainSail.rotation.y = angle;
  updateMainCloth(yacht.mainCloth, mainTrim, loads.main, time, relativeWind, hoists.main);
  updateJib(yacht.jib, jibTrim, loads.jib, time, relativeWind, hoists.jib);
  updateRigging(yacht.rigging, yacht.mainSail, yacht.jib);
}

export function createBoat() {
  const boat = new THREE.Group();
  const hull = createHull();
  const outline = hull.deckOutline;
  boat.add(hull.group);

  const deck = new THREE.Mesh(new THREE.ShapeGeometry(outline, 24), teak);
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.96;
  deck.scale.setScalar(0.94);
  deck.receiveShadow = true;
  boat.add(deck);
  for (let x = -1.5; x <= 1.5; x += 0.24) {
    boat.add(line([[x, 0.97, -2.7], [x, 0.97, 4.15]], '#95734f', 0.5));
  }
  const edge = outline.getPoints(60).map((p) => [p.x, 0.62, -p.y]);
  boat.add(line(edge, '#346364'));
  box(boat, [2.25, 0.75, 3.2], [0, 1.3, -0.5], cream);
  box(boat, [1.5, 0.08, 0.85], [0, 1.73, -1.1], dark);
  for (const x of [-1.135, 1.135]) {
    for (const z of [-1.4, -0.45, 0.5]) box(boat, [0.035, 0.32, 0.65], [x, 1.35, z], dark);
  }
  box(boat, [1.3, 0.06, 1.75], [0, 1, 2.8], dark);
  for (const x of [-1.05, 1.05]) box(boat, [0.45, 0.32, 2], [x, 1.13, 2.8], cream);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.75, 12), cream);
  pedestal.position.set(0, 1.4, 3.3); boat.add(pedestal);
  const helm = new THREE.Group();
  helm.position.set(0, 1.95, 3.3);
  helm.add(new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 8, 32), metal));
  const spokes = [];
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * Math.PI * 2;
    spokes.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(angle) * 0.43, Math.sin(angle) * 0.43, 0));
  }
  helm.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), new THREE.LineBasicMaterial({ color: '#778e86' })));
  boat.add(helm);
  for (const x of [-1.35, 1.35]) {
    const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.24, 12), metal);
    winch.position.set(x, 1.25, 1.65); boat.add(winch);
  }
  box(boat, [1.6, 0.12, 0.35], [0, 1.04, 4.35], teak);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.105, 13.3, 10), metal);
  mast.position.set(0, 7.4, -1.15);
  mast.castShadow = true;
  boat.add(mast);
  const mainSail = new THREE.Group();
  mainSail.position.set(0, 2.3, -1.15);
  const cloth = new THREE.MeshStandardMaterial({ map: sailTexture(), side: THREE.DoubleSide, roughness: 0.88 });
  const mainCloth = createMainCloth(cloth);
  mainSail.add(mainCloth);
  box(mainSail, [0.1, 0.12, 5.7], [0, -0.03, 2.8], metal);
  boat.add(mainSail);

  const jib = createJib();
  boat.add(jib);
  boat.add(line([[0, 1.7 + SAILS.jib.height, -1.2], [0, 1.7, -1.2 - SAILS.jib.foot]], '#738981'));
  boat.add(line([[0, 13.9, -1.15], [0, 1.1, 4.3]], '#738981'));
  for (const x of [-1.75, 1.75]) {
    boat.add(line([[0, 12, -1.15], [x, 1.1, 0]], '#738981'));
    for (const z of [-2.8, 0, 2.6, 4]) {
      boat.add(line([[x * 0.86, 1, z], [x * 0.86, 1.65, z]], '#b4c4b9'));
    }
    boat.add(line([[x * 0.65, 1.65, -4], [x * 0.86, 1.65, -2.8], [x * 0.86, 1.65, 4]], '#a3b7ad'));
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 8, 20), new THREE.MeshStandardMaterial({ color: '#d9774a' }));
  ring.position.set(-1.65, 1.65, 3.5);
  ring.rotation.y = Math.PI / 2;
  boat.add(ring);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.4), new THREE.MeshBasicMaterial({ color: '#d5ef87', side: THREE.DoubleSide }));
  flag.position.set(0.45, 14, -1.15);
  boat.add(flag);
  const rigging = createRigging();
  boat.add(rigging.group);
  return { boat, mainSail, mainCloth, jib, flag, rigging, rudder: hull.rudder, helm };
}
