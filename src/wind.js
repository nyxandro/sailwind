import * as THREE from 'three';
import { radians, clamp, SURFACE_EFFECT_LAYER } from './world.js';

const TRACE_COUNT = 44;
const TRACE_SEGMENTS = 5;
const FIELD_RADIUS = 62;
const TRACE_LIFETIME = 8;

export function createWind() {
  const vertexCount = TRACE_COUNT * TRACE_SEGMENTS * 2;
  const position = new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const color = new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  const object = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#42736c', vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false }));
  object.name = 'wind-traces';
  object.layers.set(SURFACE_EFFECT_LAYER);
  const traces = Array.from({ length: TRACE_COUNT }, (_, i) => ({
    x: Math.sin(i * 2.39996) * FIELD_RADIUS * 0.8,
    z: Math.cos(i * 1.75488) * FIELD_RADIUS * 0.8,
    y: 2 + (i % 7) * 1.4,
    age: ((i * 0.618034) % 1) * TRACE_LIFETIME,
  }));
  let initialized = false;

  return {
    object,
    update(game, delta) {
      if (!object.visible || game.mode === 'paused' || game.mode === 'finished') return;
      const dt = clamp(delta, 0, 0.1);
      // The compass reports where wind comes FROM; traces travel in the opposite direction.
      const dx = -Math.sin(radians(game.windDirection));
      const dz = Math.cos(radians(game.windDirection));
      const speed = game.windSpeed * 0.514444;
      const length = 3.2 + game.windSpeed * 0.14;
      let vertex = 0;
      traces.forEach((trace, i) => {
        if (!initialized) { trace.x += game.x; trace.z += game.z; }
        trace.age += dt;
        if (trace.age >= TRACE_LIFETIME || Math.hypot(trace.x - game.x, trace.z - game.z) > FIELD_RADIUS) {
          trace.x = game.x + Math.sin(i * 2.39996 + game.elapsed * 0.07) * FIELD_RADIUS * 0.7 - dx * 12;
          trace.z = game.z + Math.cos(i * 1.75488 + game.elapsed * 0.07) * FIELD_RADIUS * 0.7 - dz * 12;
          trace.age = 0;
        }
        trace.x += dx * speed * dt;
        trace.z += dz * speed * dt;
        const fade = Math.sin(Math.PI * trace.age / TRACE_LIFETIME) ** 2;
        for (let segment = 0; segment < TRACE_SEGMENTS; segment++) {
          for (let end = 0; end < 2; end++) {
            const t = (segment + end) / TRACE_SEGMENTS;
            position.setXYZ(vertex, trace.x - dx * length * (1 - t), trace.y + Math.sin(t * Math.PI) * 0.12, trace.z - dz * length * (1 - t));
            color.setXYZW(vertex, 1, 1, 1, fade * t);
            vertex++;
          }
        }
      });
      initialized = true;
      position.needsUpdate = true;
      color.needsUpdate = true;
      geometry.computeBoundingSphere();
    },
  };
}
