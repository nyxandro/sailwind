import { currentAt, waveExposure, BASE_CURRENT } from './currents.js';
import { WAVES, wavePhase } from './waves.js';
import { OCEAN_DETAIL_FULL_RATIO } from './ocean-grid.js';

export const OCEAN_FIELD_STRIDE = 24;
const EPSILON = 0.01;
const SAMPLE_OFFSETS = Object.freeze(
  [
    [0, 0],
    [EPSILON, 0],
    [-EPSILON, 0],
    [0, EPSILON],
    [0, -EPSILON],
  ].map(Object.freeze),
);
export const WAVE_FREQUENCIES = Object.freeze(
  WAVES.map((wave) => {
    const k = (2 * Math.PI) / wave.wavelength;
    return Math.sqrt(9.81 * k) + k * (BASE_CURRENT.x * wave.x + BASE_CURRENT.z * wave.z);
  }),
);

export function createOceanField(coordinates, anchorX, anchorZ) {
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorZ) || WAVES.length !== 4) {
    throw new Error('OCEAN_FIELD_INVALID: Expected a finite anchor and four wave components');
  }
  const data = new Float32Array(coordinates.length ** 2 * OCEAN_FIELD_STRIDE);
  const samples = new Float64Array(40);
  for (let row = 0; row < coordinates.length; row++) {
    for (let col = 0; col < coordinates.length; col++) {
      writeOceanCoefficients(
        coordinates[col] + anchorX,
        coordinates[row] + anchorZ,
        data,
        (row * coordinates.length + col) * OCEAN_FIELD_STRIDE,
        samples,
      );
    }
  }
  return data;
}

export function writeOceanCoefficients(x, z, data, start, samples) {
  for (let point = 0; point < SAMPLE_OFFSETS.length; point++) {
    const px = x + SAMPLE_OFFSETS[point][0];
    const pz = z + SAMPLE_OFFSETS[point][1];
    const flow = currentAt(px, pz);
    for (let i = 0; i < WAVES.length; i++) {
      const wave = WAVES[i];
      const amplitude = wave.amplitude * waveExposure(px, pz, wave);
      const phase = wavePhase(wave, px, pz, 0, flow);
      samples[point * 8 + i] = amplitude * Math.sin(phase);
      samples[point * 8 + i + 4] = amplitude * Math.cos(phase);
    }
  }
  // sin(phase - frequency * time) separates the static world from the clock.
  // The same finite differences preserve the existing surface normals exactly.
  for (let i = 0; i < 8; i++) {
    data[start + i] = samples[i];
    data[start + 8 + i] = (samples[8 + i] - samples[16 + i]) / (2 * EPSILON);
    data[start + 16 + i] = (samples[24 + i] - samples[32 + i]) / (2 * EPSILON);
  }
}

export function createOceanClock(time) {
  const sin = new Float64Array(WAVES.length);
  const cos = new Float64Array(WAVES.length);
  for (let i = 0; i < WAVES.length; i++) {
    const angle = WAVE_FREQUENCIES[i] * time;
    sin[i] = Math.sin(angle);
    cos[i] = Math.cos(angle);
  }
  return { sin, cos };
}

export function evaluateOceanCoefficients(field, vertex, clock) {
  const values = [0, 0, 0];
  const start = vertex * OCEAN_FIELD_STRIDE;
  for (let i = 0; i < WAVE_FREQUENCIES.length; i++) {
    for (let axis = 0; axis < 3; axis++) {
      values[axis] += field[start + axis * 8 + i] * clock.cos[i] - field[start + axis * 8 + i + 4] * clock.sin[i];
    }
  }
  return { height: values[0], slopeX: values[1], slopeZ: values[2] };
}

export function evaluateOceanField(field, vertex, time) {
  return evaluateOceanCoefficients(field, vertex, createOceanClock(time));
}

export const oceanFieldShader = `
  uniform vec4 oceanSinTime;
  uniform vec4 oceanCosTime;
  uniform vec2 oceanDetailCenter;
  uniform float oceanDetailRadius;
  attribute vec4 oceanHeightSin;
  attribute vec4 oceanHeightCos;
  attribute vec4 oceanSlopeXSin;
  attribute vec4 oceanSlopeXCos;
  attribute vec4 oceanSlopeZSin;
  attribute vec4 oceanSlopeZCos;
  attribute vec4 oceanCoarseHeightSin;
  attribute vec4 oceanCoarseHeightCos;
  attribute vec4 oceanCoarseSlopeXSin;
  attribute vec4 oceanCoarseSlopeXCos;
  attribute vec4 oceanCoarseSlopeZSin;
  attribute vec4 oceanCoarseSlopeZCos;
  vec3 oceanSurface(vec2 worldXZ) {
    vec3 fine = vec3(
      dot(oceanHeightSin, oceanCosTime) - dot(oceanHeightCos, oceanSinTime),
      dot(oceanSlopeXSin, oceanCosTime) - dot(oceanSlopeXCos, oceanSinTime),
      dot(oceanSlopeZSin, oceanCosTime) - dot(oceanSlopeZCos, oceanSinTime)
    );
    vec3 coarse = vec3(
      dot(oceanCoarseHeightSin, oceanCosTime) - dot(oceanCoarseHeightCos, oceanSinTime),
      dot(oceanCoarseSlopeXSin, oceanCosTime) - dot(oceanCoarseSlopeXCos, oceanSinTime),
      dot(oceanCoarseSlopeZSin, oceanCosTime) - dot(oceanCoarseSlopeZCos, oceanSinTime)
    );
    float detail = oceanDetailRadius > 0.0
      ? 1.0 - smoothstep(oceanDetailRadius * ${OCEAN_DETAIL_FULL_RATIO.toFixed(1)}, oceanDetailRadius, distance(worldXZ, oceanDetailCenter))
      : 0.0;
    return mix(coarse, fine, detail);
  }
`;
