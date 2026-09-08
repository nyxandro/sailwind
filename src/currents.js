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

const f = (number) => number.toFixed(8);
export const currentShader = `
  float coastRadiusAt(vec2 p, vec3 island) {
    vec2 delta = p - island.xy;
    float angle = length(delta) < 0.0001 ? 0.0 : atan(delta.y, delta.x);
    float phase = island.x * 0.013 + island.y * 0.017;
    return island.z * (0.92 + 0.045 * sin(angle * 3.0 + phase) + 0.025 * sin(angle * 7.0 - phase));
  }
  vec2 oceanCurrent(vec2 p) {
    vec2 flow = vec2(${f(BASE_CURRENT.x)}, ${f(BASE_CURRENT.z)});
    ${EDDIES.map((e) => `{
      vec2 d = (p - vec2(${f(e.x)}, ${f(e.z)})) / ${f(e.radius)};
      flow += vec2(-d.y, d.x) * ${f(e.strength)} * exp((1.0 - dot(d, d)) / 2.0);
    }`).join('\n')}
    ${ISLANDS.map((i) => `{
      vec3 island = vec3(${f(i.x)}, ${f(i.z)}, ${f(i.radius)});
      vec2 delta = p - island.xy;
      float distance = length(delta);
      if (distance < island.z + 35.0) {
      float shore = distance - coastRadiusAt(p, island);
      if (shore <= 0.0) return vec2(0.0);
      float angle = atan(delta.y, delta.x);
      float phase = island.x * 0.013 + island.y * 0.017;
      float derivative = island.z * (0.135 * cos(angle * 3.0 + phase) + 0.175 * cos(angle * 7.0 - phase));
      vec2 n = normalize(delta / distance + derivative * vec2(delta.y, -delta.x) / (distance * distance));
      flow -= n * dot(flow, n) * (1.0 - smoothstep(0.0, 35.0, shore));
      }
    }`).join('\n')}
    return flow / max(1.0, length(flow) / 0.65);
  }
  float oceanExposure(vec2 p, vec2 direction) {
    float exposure = 1.0;
    ${ISLANDS.map((i) => `{
      vec3 island = vec3(${f(i.x)}, ${f(i.z)}, ${f(i.radius)});
      vec2 delta = p - island.xy;
      if (length(delta) < island.z * 7.0) {
      float shore = length(delta) - coastRadiusAt(p, island);
      if (shore <= 0.0) return 0.0;
      exposure *= smoothstep(0.0, 14.0, shore);
      float along = dot(delta, direction);
      float across = abs(delta.x * direction.y - delta.y * direction.x);
      float lee = smoothstep(0.0, island.z, along)
        * (1.0 - smoothstep(island.z * 0.6, island.z + max(0.0, along) * 0.16, across))
        * (1.0 - smoothstep(island.z * 2.0, island.z * 6.0, along));
      exposure *= 1.0 - 0.88 * lee;
      }
    }`).join('\n')}
    return exposure;
  }
`;
