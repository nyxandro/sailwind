export const ROUTE = [
  { x: 55, z: -120, name: 'Попутный знак' },
  { x: 165, z: -240, name: 'Северный проход' },
  { x: 280, z: -150, name: 'За горизонтом' },
  { x: 190, z: 10, name: 'Тихая вода' },
  { x: 30, z: 85, name: 'Возвращение' },
];
export const ISLANDS = [
  { x: -115, z: -110, radius: 44, height: 20, lighthouse: true },
  { x: 295, z: -55, radius: 32, height: 15 },
  { x: 20, z: -330, radius: 53, height: 25 },
  { x: 390, z: -270, radius: 65, height: 31 },
  { x: -190, z: 140, radius: 60, height: 24 },
  { x: 360, z: 170, radius: 46, height: 22 },
];
export const BUOY_RADIUS = 14;
export const WORLD_RADIUS = 650;
export const MAX_SAIL_ANGLE = 90;
export const SURFACE_EFFECT_LAYER = 1;
export const SAILS = {
  main: { label: 'Грот', height: 11.2, foot: 5.6 },
  jib: { label: 'Стаксель', height: 9.5, foot: 4.65 },
};
export const radians = (degrees) => degrees * Math.PI / 180;
export const signedAngle = (a, b) => ((a - b + 540) % 360 + 360) % 360 - 180;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function coastRadius(island, angle) {
  const phase = island.x * 0.013 + island.z * 0.017;
  return island.radius * (0.92 + 0.045 * Math.sin(angle * 3 + phase) + 0.025 * Math.sin(angle * 7 - phase));
}

export function shoreDistance(x, z, island) {
  const dx = x - island.x;
  const dz = z - island.z;
  return Math.hypot(dx, dz) - coastRadius(island, Math.atan2(dz, dx));
}

export function islandHeightAt(island, x, z) {
  const r = Math.hypot(x, z) / coastRadius(island, Math.atan2(z, x));
  if (r > 1) return -5 * smoothstep(1, 1.25, r);
  const rockiness = 0.72 + 0.16 * Math.sin(x * 0.12 + island.x) * Math.cos(z * 0.09) + 0.12 * Math.sin(z * 0.17 + x * 0.06);
  return island.height * (1 - r * r) ** 2 * rockiness;
}
