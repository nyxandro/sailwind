import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleWaves, WAVES, wavePhase } from './waves.js';
import { currentAt } from './currents.js';

test('waves are continuous, bounded and use the same time for every floating object', () => {
  const limit = WAVES.reduce((sum, wave) => sum + wave.amplitude, 0);
  for (const [x, z] of [[0, 0], [-120, 30], [300, -650]]) {
    for (let time = 0; time < 50; time += 0.5) {
      const a = sampleWaves(x, z, time);
      assert.deepEqual(a, sampleWaves(x, z, time));
      assert.ok(Math.abs(a.height) <= limit);
      assert.ok(Object.values(a).every(Number.isFinite));
      assert.ok(Math.abs(a.height - sampleWaves(x, z, time + 0.01).height) < 0.03);
    }
  }
  assert.notEqual(sampleWaves(0, 0, 1).height, sampleWaves(0, 0, 2).height);
});

test('a weak coastal current cannot reverse the travelling wave fronts', () => {
  const points = [[292.96694, -17.52897], [0, 0], [-70, -120], [160, -240]];
  for (const wave of WAVES) {
    for (const [x, z] of points) {
      const phase = (px, pz) => wavePhase(wave, px, pz, 4, currentAt(px, pz));
      const along = (phase(x + wave.x * 0.01, z + wave.z * 0.01) - phase(x - wave.x * 0.01, z - wave.z * 0.01)) / 0.02;
      assert.ok(along > 0);
    }
  }
});

test('wave slopes match the surface used for buoyancy and lighting', () => {
  for (const [x, z, time] of [[3, 7, 0], [-30, 15, 4], [150, -250, 17]]) {
    const sample = sampleWaves(x, z, time);
    const dx = (sampleWaves(x + 0.001, z, time).height - sampleWaves(x - 0.001, z, time).height) / 0.002;
    const dz = (sampleWaves(x, z + 0.001, time).height - sampleWaves(x, z - 0.001, time).height) / 0.002;
    assert.ok(Math.abs(dx - sample.slopeX) < 1e-5);
    assert.ok(Math.abs(dz - sample.slopeZ) < 1e-5);
  }
});
