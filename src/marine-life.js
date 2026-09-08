import * as THREE from 'three';
import { createAnimal } from './animal-models.js';
import { ISLANDS, radians, SURFACE_EFFECT_LAYER } from './world.js';
import { GROUNDING_SCALE } from './shore-collision.js';

const ENCOUNTERS = [
  { kind: 'fish', count: 2, period: 19, duration: 7, start: 3, speed: 3.8 },
  { kind: 'dolphin', count: 2, period: 39, duration: 13, start: 8, speed: 3.6 },
];

export function createMarineLife(heightAt) {
  const group = new THREE.Group();
  group.name = 'marine-life';
  const actors = ENCOUNTERS.flatMap((config) => Array.from({ length: config.count }, (_, index) => {
    const model = createAnimal(config.kind);
    model.root.name = `animal-${config.kind}-${index}`;
    const splash = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 32), new THREE.MeshBasicMaterial({ color: '#e8f5e5', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    splash.rotation.x = -Math.PI / 2;
    splash.visible = false;
    splash.layers.set(SURFACE_EFFECT_LAYER);
    group.add(model.root, splash);
    return { ...model, ...config, index, splash, splashTime: null, cycle: null, anchor: new THREE.Vector3(), heading: 0, placed: false, above: false };
  }));

  function place(actor, game, cycle) {
    const side = (actor.index + cycle) % 2 === 0 ? 1 : -1;
    const heading = radians(game.heading) + side * 0.4;
    const vx = Math.sin(heading) * actor.speed;
    const vz = -Math.cos(heading) * actor.speed;
    // Search a few clear crossing paths; skip the encounter if every path reaches land.
    for (let candidate = 0; candidate < 6; candidate++) {
      const angle = radians(game.heading) + side * (0.9 + candidate * 0.4);
      const radius = 24 + actor.index * 1.5;
      const x = game.x + Math.sin(angle) * radius;
      const z = game.z - Math.cos(angle) * radius;
      const lengthSquared = (vx * vx + vz * vz) * actor.duration ** 2;
      const blocked = ISLANDS.some((island) => {
        const t = Math.max(0, Math.min(1, ((island.x - x) * vx + (island.z - z) * vz) * actor.duration / lengthSquared));
        return Math.hypot(x + vx * actor.duration * t - island.x, z + vz * actor.duration * t - island.z) < island.radius * GROUNDING_SCALE + 6;
      });
      if (blocked) continue;
      actor.anchor.set(x, 0, z);
      actor.heading = heading;
      return true;
    }
    return false;
  }

  return {
    group,
    update(game, time) {
      if (game.mode === 'paused' || game.mode === 'finished') return;
      for (const actor of actors) {
        const clock = time - actor.start - actor.index * 0.55;
        const cycle = Math.floor(clock / actor.period);
        const age = clock - cycle * actor.period;
        const active = clock >= 0 && age < actor.duration;
        actor.root.visible = false;
        if (active) {
          if (actor.cycle !== cycle) {
            actor.cycle = cycle;
            actor.placed = place(actor, game, cycle);
            actor.above = false;
          }
          const x = actor.anchor.x + Math.sin(actor.heading) * actor.speed * age;
          const z = actor.anchor.z - Math.cos(actor.heading) * actor.speed * age;
          if (actor.placed && Math.hypot(x - game.x, z - game.z) < 100) {
            const surfaceHeight = heightAt(x, z, time);
            const phase = age * (actor.kind === 'dolphin' ? 1.6 : 3.2);
            const jump = Math.max(0, Math.sin(phase));
            const height = -0.9 + jump ** 2 * (actor.kind === 'dolphin' ? 3.6 : 2);
            const rise = jump === 0 ? 0 : 2 * jump * Math.cos(phase) * (actor.kind === 'dolphin' ? 3.6 * 1.6 : 2 * 3.2);
            actor.root.position.set(x, surfaceHeight + height, z);
            actor.root.rotation.set(Math.atan2(rise, actor.speed) * 0.55, -actor.heading, 0, 'YXZ');
            actor.root.visible = true;
            if (actor.kind === 'dolphin') actor.tail.rotation.x = Math.sin(time * 6) * 0.25;
            else actor.tail.rotation.y = Math.sin(time * 10) * 0.35;
            if (actor.above && height <= 0) {
              actor.splashTime = time;
              actor.splash.position.set(x, surfaceHeight + 0.06, z);
            }
            actor.above = height > 0;
          }
        }
        const splashAge = actor.splashTime === null ? 2 : time - actor.splashTime;
        actor.splash.visible = splashAge >= 0 && splashAge < 1.4;
        if (actor.splash.visible) {
          actor.splash.scale.setScalar(0.4 + splashAge * (actor.kind === 'dolphin' ? 2 : 1));
          actor.splash.material.opacity = (1 - splashAge / 1.4) * 0.45;
          actor.splash.position.y = heightAt(actor.splash.position.x, actor.splash.position.z, time) + 0.06;
        }
      }
    },
  };
}
