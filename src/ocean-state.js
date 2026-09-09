import { createOceanClock } from './ocean-field.js';
import { sampleOceanSurface } from './ocean-patch.js';
import { OCEAN_ANCHOR_STEP, OCEAN_HALF_SIZE, OCEAN_DETAIL_RADIUS, COARSE_OCEAN_STEP } from './ocean-grid.js';

const DETAIL_RECOVERY_SPEED = OCEAN_DETAIL_RADIUS * 2;

export function createOceanState() {
  const frame = { patch: null, coarseField: null, detail: { x: 0, z: 0, radius: OCEAN_DETAIL_RADIUS }, clock: null };
  let pending = null;
  let sampledTime;
  function clock(time) {
    if (!frame.patch) throw new Error('OCEAN_NOT_READY: The initial wave fields have not arrived');
    if (sampledTime !== time) {
      frame.clock = createOceanClock(time);
      sampledTime = time;
    }
    return frame.clock;
  }
  return {
    accept(data) {
      if (!frame.patch) {
        frame.patch = data;
        frame.coarseField = data.coarseField;
        frame.detail.x = data.x;
        frame.detail.z = data.z;
      } else {
        pending = data;
      }
    },
    update(x, z, time, delta) {
      if (![x, z, time, delta].every(Number.isFinite) || delta < 0)
        throw new Error('OCEAN_INPUT_INVALID: Expected finite coordinates, time and a non-negative delta');
      clock(time);
      const requestedX = Math.round(x / OCEAN_ANCHOR_STEP) * OCEAN_ANCHOR_STEP;
      const requestedZ = Math.round(z / OCEAN_ANCHOR_STEP) * OCEAN_ANCHOR_STEP;
      let changed = false;
      if (pending) {
        if (pending.x === requestedX && pending.z === requestedZ) {
          frame.patch = pending;
          changed = true;
        }
        pending = null;
      }
      frame.detail.x = x;
      frame.detail.z = z;
      // Keep detail strictly inside the loaded patch even if the worker is late.
      // Normal 8 m updates retain the full radius and do not animate anything.
      const margin = OCEAN_HALF_SIZE - Math.max(Math.abs(x - frame.patch.x), Math.abs(z - frame.patch.z)) - COARSE_OCEAN_STEP;
      const available = Math.max(0, Math.min(OCEAN_DETAIL_RADIUS, margin));
      frame.detail.radius = Math.min(available, frame.detail.radius + (changed ? 0 : delta * DETAIL_RECOVERY_SPEED));
      return frame;
    },
    heightAt(x, z, time) {
      return sampleOceanSurface(frame.patch, frame.coarseField, frame.detail, x, z, clock(time));
    },
  };
}
