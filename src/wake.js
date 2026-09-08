import * as THREE from 'three';
import { currentAt } from './currents.js';
import { radians, SURFACE_EFFECT_LAYER } from './world.js';

const CAPACITY = 96;
const LIFETIME = 11;
const EMISSION_INTERVAL = 0.14;

export function createWake(heightAt) {
  const group = new THREE.Group();
  group.name = 'yacht-wake';
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { clock: time },
    vertexShader: `attribute float strength; varying vec2 vFoam; varying float vStrength;
      void main(){ vFoam=uv; vStrength=strength; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float clock; varying vec2 vFoam; varying float vStrength;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p), f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
      void main(){
        vec2 p=vec2(vFoam.x*13.0,vFoam.y*0.7);
        float bubbles=noise(p+vec2(0.0,clock*0.08))*0.65+noise(p*3.7)*0.35;
        float edge=pow(max(0.0,1.0-abs(vFoam.x*2.0-1.0)),0.6);
        float foam=smoothstep(0.3,0.7,bubbles)*edge*vStrength;
        gl_FragColor=vec4(mix(vec3(0.65,0.83,0.82),vec3(0.96,0.98,0.9),bubbles),foam);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  for (let ribbon = 0; ribbon < 3; ribbon++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(CAPACITY * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(CAPACITY * 2 * 2), 2).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('strength', new THREE.Float32BufferAttribute(new Float32Array(CAPACITY * 2), 1).setUsage(THREE.DynamicDrawUsage));
    const indices = [];
    for (let i = 0; i < CAPACITY - 1; i++) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.layers.set(SURFACE_EFFECT_LAYER);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  const points = [];
  let lastEmission = -EMISSION_INTERVAL;
  let distance = 0;
  return {
    group,
    reset() { points.length = 0; lastEmission = -EMISSION_INTERVAL; distance = 0; group.children.forEach((mesh) => mesh.geometry.setDrawRange(0, 0)); },
    update(game, clock, delta) {
      if (game.mode !== 'sailing') return;
      const dt = Math.min(0.1, Math.max(0, delta));
      time.value = clock;
      const flowAtHull = currentAt(game.x, game.z);
      const relativeX = game.velocityX - flowAtHull.x;
      const relativeZ = game.velocityZ - flowAtHull.z;
      const waterSpeed = Math.hypot(relativeX, relativeZ);
      for (const point of points) {
        const flow = currentAt(point.x, point.z);
        point.x += flow.x * dt;
        point.z += flow.z * dt;
        point.age += dt;
      }
      while (points.length && points[0].age >= LIFETIME) points.shift();
      distance += waterSpeed * dt;
      if (waterSpeed > 0.4 && clock - lastEmission >= EMISSION_INTERVAL) {
        const heading = radians(game.heading);
        const surge = relativeX * Math.sin(heading) - relativeZ * Math.cos(heading);
        const trailing = surge < 0 ? -5.7 : 4.8;
        points.push({ x: game.x - Math.sin(heading) * trailing, z: game.z + Math.cos(heading) * trailing, nx: -relativeZ / waterSpeed, nz: relativeX / waterSpeed, speed: waterSpeed, age: 0, distance });
        if (points.length > CAPACITY) points.shift();
        lastEmission = clock;
      }
      group.children.forEach((mesh, ribbon) => {
        const { position, uv, strength } = mesh.geometry.attributes;
        points.forEach((point, i) => {
          const spread = ribbon === 0 ? 0 : (ribbon === 1 ? -1 : 1) * (1.25 + point.age * point.speed * 0.32);
          const width = ribbon === 0 ? 1.3 + point.age * 0.16 : 0.2 + point.age * 0.025;
          const alpha = Math.min(1, point.speed / 4) * (1 - point.age / LIFETIME) ** 2 * (ribbon === 0 ? 0.65 : 0.32);
          for (let side = 0; side < 2; side++) {
            const offset = spread + (side * 2 - 1) * width;
            const x = point.x + point.nx * offset;
            const z = point.z + point.nz * offset;
            position.setXYZ(i * 2 + side, x, heightAt(x, z, clock) + 0.045, z);
            uv.setXY(i * 2 + side, side, point.distance);
            strength.setX(i * 2 + side, alpha);
          }
        });
        position.needsUpdate = uv.needsUpdate = strength.needsUpdate = true;
        mesh.geometry.setDrawRange(0, Math.max(0, points.length - 1) * 6);
      });
    },
  };
}
