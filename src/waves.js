import { BASE_CURRENT, currentAt, waveExposure } from './currents.js';
import { YACHT_PHYSICS } from './motion.js';

export const WAVES = [
  { amplitude: 0.38, wavelength: 22, x: 0.8, z: 0.6, phase: 0 },
  { amplitude: 0.23, wavelength: 12, x: 0.28, z: 0.96, phase: 1.4 },
  { amplitude: 0.12, wavelength: 6.5, x: 0.96, z: 0.28, phase: 2.1 },
  { amplitude: 0.055, wavelength: 3.4, x: 0.6, z: 0.8, phase: 0.7 },
];
const CURRENT_WARP_SECONDS = 2;

export function wavePhase(wave, x, z, time, flow) {
  const k = 2 * Math.PI / wave.wavelength;
  const baseDrift = BASE_CURRENT.x * wave.x + BASE_CURRENT.z * wave.z;
  const localWarp = ((flow.x - BASE_CURRENT.x) * wave.x + (flow.z - BASE_CURRENT.z) * wave.z) * CURRENT_WARP_SECONDS;
  return k * (wave.x * x + wave.z * z - localWarp) - (Math.sqrt(9.81 * k) + k * baseDrift) * time + wave.phase;
}

export function waveHeight(x, z, time) {
  let height = 0;
  const flow = currentAt(x, z);
  for (const wave of WAVES) {
    const phase = wavePhase(wave, x, z, time, flow);
    height += wave.amplitude * waveExposure(x, z, wave) * Math.sin(phase);
  }
  return height;
}

export function sampleWaves(x, z, time) {
  const epsilon = 0.01;
  return {
    height: waveHeight(x, z, time),
    slopeX: (waveHeight(x + epsilon, z, time) - waveHeight(x - epsilon, z, time)) / (epsilon * 2),
    slopeZ: (waveHeight(x, z + epsilon, time) - waveHeight(x, z - epsilon, time)) / (epsilon * 2),
  };
}

export function createBuoyancyState() {
  return { initialized: false, height: 0, pitch: 0, roll: 0, heightVelocity: 0, pitchVelocity: 0, rollVelocity: 0 };
}

export function applyBuoyancy(boat, x, z, heading, time, heel, heightAt, state, delta) {
  const front = heightAt(x + Math.sin(heading) * 4, z - Math.cos(heading) * 4, time);
  const back = heightAt(x - Math.sin(heading) * 4, z + Math.cos(heading) * 4, time);
  const right = heightAt(x + Math.cos(heading) * 1.7, z + Math.sin(heading) * 1.7, time);
  const left = heightAt(x - Math.cos(heading) * 1.7, z - Math.sin(heading) * 1.7, time);
  const waveRoll = Math.max(-YACHT_PHYSICS.maxWaveRoll, Math.min(YACHT_PHYSICS.maxWaveRoll, Math.atan2(right - left, 3.4) * 0.45));
  const targets = {
    height: (heightAt(x, z, time) * 2 + front + back + right + left) / 6,
    pitch: Math.atan2(front - back, 8) * 0.5,
    roll: Math.max(-YACHT_PHYSICS.maxRoll, Math.min(YACHT_PHYSICS.maxRoll, waveRoll + heel)),
  };
  const dt = Math.max(0, Math.min(delta, 0.1));
  const massResponse = Math.sqrt(YACHT_PHYSICS.referenceMass / YACHT_PHYSICS.mass);
  for (const [axis, frequency] of [['height', YACHT_PHYSICS.heaveFrequency], ['pitch', YACHT_PHYSICS.pitchFrequency], ['roll', YACHT_PHYSICS.rollFrequency]]) {
    const omega = frequency * massResponse;
    if (!state.initialized) { state[axis] = targets[axis]; continue; }
    const velocity = `${axis}Velocity`;
    const offset = state[axis] - targets[axis];
    const change = (state[velocity] + omega * offset) * dt;
    const decay = Math.exp(-omega * dt);
    state[axis] = targets[axis] + (offset + change) * decay;
    state[velocity] = (state[velocity] - omega * change) * decay;
  }
  state.initialized = true;
  boat.position.set(x, state.height, z);
  boat.rotation.set(state.pitch, -heading, state.roll, 'YXZ');
}
