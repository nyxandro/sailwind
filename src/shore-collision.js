import { ISLANDS, coastRadius, islandHeightAt, radians, clamp } from './world.js';

export const GROUNDING_DEPTH = 3.4;
const HULL_HALF_AXIS = 4.1;
const HULL_RADIUS = 2.1;
const CONTOUR_POINTS = 128;

// Include the submerged beach, with clearance for the keel and vertical motion.
let low = 1;
let high = 1.25;
for (let i = 0; i < 32; i++) {
  const mid = (low + high) / 2;
  const island = ISLANDS[0];
  if (-islandHeightAt(island, coastRadius(island, 0) * mid, 0) < GROUNDING_DEPTH) low = mid;
  else high = mid;
}
export const GROUNDING_SCALE = high;
const contours = ISLANDS.map((island) => Array.from({ length: CONTOUR_POINTS }, (_, i) => {
  const angle = i / CONTOUR_POINTS * Math.PI * 2;
  const radius = coastRadius(island, angle) * GROUNDING_SCALE;
  return { x: island.x + Math.cos(angle) * radius, z: island.z + Math.sin(angle) * radius };
}));

function inside(p, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) result = !result;
  }
  return result;
}

function nearest(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return { x: a.x + t * dx, z: a.z + t * dz };
}

function contact(a, b, polygon) {
  let best = null;
  for (let i = 0; i < polygon.length; i++) {
    const c = polygon[i], d = polygon[(i + 1) % polygon.length];
    const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z;
    const cross = rx * sz - rz * sx;
    const pairs = [[a, nearest(a, c, d)], [b, nearest(b, c, d)], [nearest(c, a, b), c], [nearest(d, a, b), d]];
    if (Math.abs(cross) > 1e-10) {
      const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / cross;
      const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / cross;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        const p = { x: a.x + t * rx, z: a.z + t * rz };
        pairs.push([p, p]);
      }
    }
    for (const [p, q] of pairs) {
      const distance = Math.hypot(p.x - q.x, p.z - q.z);
      if (best === null || distance < best.distance) best = { p, q, c, d, distance };
    }
  }
  const penetrating = inside(a, polygon) || inside(b, polygon);
  if (!penetrating && best.distance >= HULL_RADIUS - 1e-7) return null;
  if (penetrating || best.distance < 1e-7) {
    const dx = best.d.x - best.c.x, dz = best.d.z - best.c.z;
    const length = Math.hypot(dx, dz);
    const nx = dz / length, nz = -dx / length;
    const signed = Math.min((a.x - best.q.x) * nx + (a.z - best.q.z) * nz, (b.x - best.q.x) * nx + (b.z - best.q.z) * nz);
    return { x: nx * (HULL_RADIUS - signed + 0.001), z: nz * (HULL_RADIUS - signed + 0.001) };
  }
  const push = (HULL_RADIUS - best.distance + 0.001) / best.distance;
  return { x: (best.p.x - best.q.x) * push, z: (best.p.z - best.q.z) * push };
}

export function resolveShoreCollision(x, z, heading) {
  const fx = Math.sin(radians(heading)) * HULL_HALF_AXIS;
  const fz = -Math.cos(radians(heading)) * HULL_HALF_AXIS;
  let hit = false;
  for (const [index, island] of ISLANDS.entries()) {
    if (Math.hypot(x - island.x, z - island.z) > island.radius * GROUNDING_SCALE + HULL_HALF_AXIS + HULL_RADIUS) continue;
    for (let iteration = 0; iteration < 8; iteration++) {
      const correction = contact({ x: x + fx, z: z + fz }, { x: x - fx, z: z - fz }, contours[index]);
      if (!correction) break;
      x += correction.x; z += correction.z; hit = true;
      if (iteration === 7 && contact({ x: x + fx, z: z + fz }, { x: x - fx, z: z - fz }, contours[index])) {
        throw new Error('SHORE_COLLISION_UNRESOLVED: Hull could not be moved outside the grounding contour');
      }
    }
  }
  return { x, z, hit };
}
