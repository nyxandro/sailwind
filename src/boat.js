import * as THREE from 'three';
import { radians, SAILS } from './world.js';
import { createJib, updateJib } from './jib.js';
import { createMainCloth, updateMainCloth } from './sail-cloth.js';
import { createRigging, updateRigging } from './rigging.js';
import { RIG_LAYOUT } from './yacht/rig-layout.js';

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

export function createBoat(hull) {
  const boat = hull.group;
  boat.name = 'sailwind-yacht';
  const metal = new THREE.MeshStandardMaterial({ color: '#c6ccc4', metalness: 0.5, roughness: 0.4 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.105, 13.3, 10), metal);
  mast.position.set(...RIG_LAYOUT.mast);
  mast.castShadow = true;
  boat.add(mast);
  const mainSail = new THREE.Group();
  mainSail.position.set(...RIG_LAYOUT.mainBase);
  const cloth = new THREE.MeshStandardMaterial({ map: sailTexture(), side: THREE.DoubleSide, roughness: 0.88 });
  const mainCloth = createMainCloth(cloth);
  mainSail.add(mainCloth);
  box(mainSail, [0.1, 0.12, 5.7], [0, -0.03, 2.8], metal);
  boat.add(mainSail);

  const jib = createJib();
  boat.add(jib);
  const [tackX, tackY, tackZ] = RIG_LAYOUT.jibTack;
  boat.add(line([[tackX, tackY + SAILS.jib.height, tackZ + SAILS.jib.foot], RIG_LAYOUT.jibTack], '#738981'));
  boat.add(line([RIG_LAYOUT.mastTop, RIG_LAYOUT.backstay], '#738981'));
  for (const anchor of [RIG_LAYOUT.shroudPort, RIG_LAYOUT.shroudStarboard]) {
    boat.add(line([[0, 12, RIG_LAYOUT.mast[2]], anchor], '#738981'));
  }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.4), new THREE.MeshBasicMaterial({ color: '#d5ef87', side: THREE.DoubleSide }));
  flag.position.set(0.45, 14, RIG_LAYOUT.mast[2]);
  boat.add(flag);
  const rigging = createRigging();
  boat.add(rigging.group);
  return { boat, mainSail, mainCloth, jib, flag, rigging, hull };
}
