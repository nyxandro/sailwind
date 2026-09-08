import * as THREE from 'three';
import { createBoat, setSailTrim } from './boat.js';
import { rigPower } from './game.js';
import { ISLANDS, ROUTE, BUOY_RADIUS, radians, signedAngle, SURFACE_EFFECT_LAYER } from './world.js';
import { createWind } from './wind.js';
import { createOcean } from './ocean.js';
import { applyBuoyancy, createBuoyancyState } from './waves.js';
import { createMarineLife } from './marine-life.js';
import { createIsland } from './islands.js';
import { createWake } from './wake.js';
import { windHeel } from './motion.js';

function createBuoy(point) {
  const group = new THREE.Group();
  group.position.set(point.x, 0, point.z);
  const material = new THREE.MeshStandardMaterial({ color: '#edb269', roughness: 0.55 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 1.1, 12), material);
  base.position.y = 0.6;
  group.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 8), new THREE.MeshStandardMaterial({ color: '#ede7c9' }));
  pole.position.y = 2.6;
  group.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.15), material);
  flag.position.set(1, 4.25, 0);
  flag.material.side = THREE.DoubleSide;
  group.add(flag);
  const ring = new THREE.Mesh(new THREE.RingGeometry(BUOY_RADIUS - 0.4, BUOY_RADIUS, 80), new THREE.MeshBasicMaterial({ color: '#e6f7a7', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  ring.geometry.rotateX(-Math.PI / 2);
  ring.position.y = 0.12;
  ring.layers.set(SURFACE_EFFECT_LAYER);
  group.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 34, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#e6f7a7', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 17;
  group.add(beam);
  return { group, ring, beam, material };
}

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Трёхмерное море, парусная яхта и острова');
  renderer.domElement.setAttribute('role', 'img');
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c5d9ce');
  scene.fog = new THREE.Fog('#c5d9ce', 160, 650);
  scene.add(new THREE.HemisphereLight('#fff7df', '#507b70', 2.6));
  const sun = new THREE.DirectionalLight('#fff2d2', 3.1);
  sun.position.set(-65, 100, -50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 220 });
  sun.shadow.bias = -0.001;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(43, 1, 0.5, 2200);
  camera.layers.enable(SURFACE_EFFECT_LAYER);
  const ocean = createOcean(renderer, scene);
  const marineLife = createMarineLife(ocean.heightAt);
  scene.add(marineLife.group);
  ISLANDS.forEach((island, i) => scene.add(createIsland(island, i)));
  const yacht = createBoat();
  scene.add(yacht.boat);
  const buoys = ROUTE.map(createBuoy);
  buoys.forEach((buoy) => scene.add(buoy.group));
  const wind = createWind();
  scene.add(wind.object);

  const wake = createWake(ocean.heightAt);
  scene.add(wake.group);
  let buoyancy = createBuoyancyState();
  const birds = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.3, 0.25, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.3, 0.25, 0),
    ]);
    const bird = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#4b6a60' }));
    bird.position.set(-65 + i * 7, 24 + Math.sin(i) * 5, -80 - (i % 3) * 9);
    birds.add(bird);
  }
  scene.add(birds);

  let orbit = 0;
  let zoom = 1;
  let initialized = false;
  const target = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.setViewOffset(width, height, -width * (camera.aspect < 0.85 ? 0.13 : 0.06), camera.aspect < 0.85 ? height * 0.025 : 0, width, height);
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  return {
    renderer,
    rotate(delta) { orbit += delta; },
    zoom(delta) { zoom = THREE.MathUtils.clamp(zoom + delta, 0.7, 1.5); },
    resetCamera() { orbit = 0; zoom = 1; initialized = false; },
    resetVoyage() { orbit = 0; zoom = 1; initialized = false; buoyancy = createBuoyancyState(); wake.reset(); },
    setWindVisible(visible) { wind.object.visible = visible; },
    render(game, time, dt) {
      const heading = radians(game.heading);
      const sail = rigPower(game);
      ocean.update(game, time);
      const motionDelta = game.mode === 'paused' || game.mode === 'finished' ? 0 : dt;
      applyBuoyancy(yacht.boat, game.x, game.z, heading, time, windHeel(game, sail.power), ocean.heightAt, buoyancy, motionDelta);
      yacht.rudder.rotation.y = radians(game.rudder * 30);
      yacht.helm.rotation.z = -game.rudder * Math.PI * 0.75;
      setSailTrim(yacht, game.mainTrim, game.jibTrim, { main: sail.main.power, jib: sail.jib.power }, time, signedAngle(game.heading, game.windDirection));
      marineLife.update(game, time);
      wind.update(game, dt);
      yacht.flag.rotation.y = Math.sin(time * 5) * 0.2;
      const narrow = camera.aspect < 0.85;
      const angle = 0.58 + orbit;
      const distance = (narrow ? 74 : 50) * zoom;
      target.set(game.x - (narrow ? 0 : 2), 2.7, game.z - 3);
      desiredCamera.set(game.x + Math.sin(angle) * distance, (narrow ? 33 : 28) * zoom, game.z + Math.cos(angle) * distance);
      camera.position.lerp(desiredCamera, initialized ? 1 - Math.exp(-dt * 4) : 1);
      camera.lookAt(target);
      initialized = true;
      sun.position.set(game.x - 65, 100, game.z - 50);
      sun.target.position.set(game.x, 0, game.z);
      birds.position.x = Math.sin(time * 0.04) * 20;
      birds.children.forEach((bird, i) => { bird.rotation.z = Math.sin(time * 2.4 + i) * 0.1; });
      buoys.forEach((buoy, i) => {
        const active = i === game.waypoint;
        buoy.group.position.y = ocean.heightAt(buoy.group.position.x, buoy.group.position.z, time);
        buoy.ring.visible = active;
        if (active) {
          const positions = buoy.ring.geometry.attributes.position;
          for (let j = 0; j < positions.count; j++) {
            positions.setY(j, ocean.heightAt(buoy.group.position.x + positions.getX(j), buoy.group.position.z + positions.getZ(j), time) - buoy.group.position.y);
          }
          positions.needsUpdate = true;
        }
        buoy.beam.visible = active;
        buoy.ring.material.opacity = 0.45 + Math.sin(time * 2) * 0.15;
        buoy.material.color.set(i < game.waypoint ? '#779b89' : active ? '#e3ef93' : '#de9c62');
      });
      wake.update(game, time, dt);
      renderer.render(scene, camera);
    },
    projectWaypoint(game) {
      const point = ROUTE[game.waypoint];
      if (!point) return null;
      const position = new THREE.Vector3(point.x, 8, point.z).project(camera);
      return { x: (position.x * 0.5 + 0.5) * container.clientWidth, y: (-position.y * 0.5 + 0.5) * container.clientHeight, visible: position.z > -1 && position.z < 1 && Math.abs(position.x) < 0.85 && Math.abs(position.y) < 0.85 };
    },
    dispose() {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      ocean.dispose();
      scene.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
        object.geometry?.dispose();
        if (!object.material) return;
        for (const material of [object.material].flat()) {
          material.map?.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
