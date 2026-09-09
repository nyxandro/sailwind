import { ISLANDS, coastRadius, smoothstep } from './world.js';

export const BASE_CURRENT = { x: 0.12, z: -0.04 };
const EDDIES = [
  { x: -40, z: -65, radius: 95, strength: 0.28 },
  { x: 200, z: 10, radius: 110, strength: -0.27 },
  { x: 120, z: -240, radius: 80, strength: 0.18 },
];

export function currentAt(x, z) {
  let vx = BASE_CURRENT.x;
  let vz = BASE_CURRENT.z;
  for (const eddy of EDDIES) {
    const dx = (x - eddy.x) / eddy.radius;
    const dz = (z - eddy.z) / eddy.radius;
    const strength = eddy.strength * Math.exp((1 - dx * dx - dz * dz) / 2);
    vx -= dz * strength;
    vz += dx * strength;
  }
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= island.radius + 35) continue;
    const angle = Math.atan2(dz, dx);
    const shore = distance - coastRadius(island, angle);
    if (shore <= 0) return { x: 0, z: 0 };
    const near = 1 - smoothstep(0, 35, shore);
    const phase = island.x * 0.013 + island.z * 0.017;
    const derivative = island.radius * (0.135 * Math.cos(angle * 3 + phase) + 0.175 * Math.cos(angle * 7 - phase));
    const nx = dx / distance + derivative * dz / (distance * distance);
    const nz = dz / distance - derivative * dx / (distance * distance);
    const length = Math.hypot(nx, nz);
    const normalSpeed = (vx * nx + vz * nz) / length;
    vx -= nx / length * normalSpeed * near;
    vz -= nz / length * normalSpeed * near;
  }
  const scale = Math.max(1, Math.hypot(vx, vz) / 0.65);
  return { x: vx / scale, z: vz / scale };
}

export function waveExposure(x, z, direction) {
  let exposure = 1;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= island.radius * 7) continue;
    const shore = distance - coastRadius(island, Math.atan2(dz, dx));
    if (shore <= 0) return 0;
    exposure *= smoothstep(0, 14, shore);
    const along = dx * direction.x + dz * direction.z;
    const across = Math.abs(dx * direction.z - dz * direction.x);
    const lee = smoothstep(0, island.radius, along)
      * (1 - smoothstep(island.radius * 0.6, island.radius + Math.max(0, along) * 0.16, across))
      * (1 - smoothstep(island.radius * 2, island.radius * 6, along));
    exposure *= 1 - 0.88 * lee;
  }
  return exposure;
}
