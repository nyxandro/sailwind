import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { waveShader } from './waves.js';
import { createOceanGeometry, sampleOceanHeight } from './ocean-surface.js';
import { createSeabed, MAX_SEABED_DEPTH, DEPTH_MAP_WORLD_SIZE } from './seabed.js';
import { createWaterOptics } from './water-optics.js';

export function createOcean(renderer, scene) {
  const time = { value: 0 };
  const seabed = createSeabed();
  scene.add(seabed.group);
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const uniforms = sky.material.uniforms;
  uniforms.sunPosition.value.set(-65, 100, -50).normalize();
  uniforms.turbidity.value = 2;
  uniforms.rayleigh.value = 1.5;
  uniforms.cloudCoverage.value = 0.3;
  uniforms.cloudDensity.value = 0.25;
  uniforms.showSunDisc.value = false;
  const skyScene = new THREE.Scene();
  skyScene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(skyScene, 0.025, 0.1, 10000);
  pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.12;
  scene.background = environment.texture;
  skyScene.remove(sky);
  sky.geometry.dispose();
  sky.material.dispose();

  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const noise = (u, v, frequency) => {
    const x = u * frequency;
    const y = v * frequency;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const hash = (a, b) => {
      const n = Math.sin(((a % frequency + frequency) % frequency) * 127.1 + ((b % frequency + frequency) % frequency) * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const sx = (x - ix) ** 2 * (3 - 2 * (x - ix));
    const sy = (y - iy) ** 2 * (3 - 2 * (y - iy));
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), sx), THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
  };
  const ripple = (u, v) => noise(u, v, 4) * 0.6 + noise(u, v, 9) * 0.28 + noise(u, v, 19) * 0.12;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const dx = (ripple(u + 1 / size, v) - ripple(u - 1 / size, v)) * 20;
      const dy = (ripple(u, v + 1 / size) - ripple(u, v - 1 / size)) * 20;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const normalMap = new THREE.DataTexture(data, size, size);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.generateMipmaps = true;
  normalMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  normalMap.needsUpdate = true;

  const geometry = createOceanGeometry();
  const optics = createWaterOptics(renderer);
  // Screen-space transmission includes the deck; use clipped underwater and mirrored views instead.
  const material = new THREE.MeshPhysicalMaterial({
    color: '#c9ecec', roughness: 0.22, metalness: 0,
    transmission: 0, ior: 1.333,
    normalMap, normalScale: new THREE.Vector2(0.18, 0.18),
    envMapIntensity: 0,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, optics.uniforms, {
      waterDepthMap: { value: seabed.depthMap },
      waterAttenuation: { value: new THREE.Color('#2186b0') },
    });
    shader.uniforms.oceanTime = time;
    shader.vertexShader = waveShader + `
      uniform mat4 waterReflectionMatrix;
      uniform mat4 waterRefractionMatrix;
      varying vec4 waterReflectionCoord;
      varying vec4 waterRefractionCoord;
      varying vec3 waterWorldPosition;
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 surface = oceanSurface((modelMatrix * vec4(position, 1.0)).xz);
        objectNormal = normalize(vec3(-surface.y, 1.0, -surface.z));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += surface.x;
        waterWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        waterReflectionCoord = waterReflectionMatrix * vec4(waterWorldPosition, 1.0);
        waterRefractionCoord = waterRefractionMatrix * vec4(waterWorldPosition, 1.0);`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vec2 waterWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
        vNormalMapUv = waterWorldXZ * 0.12 + vec2(oceanTime * 0.016, oceanTime * 0.009);`);
    shader.fragmentShader = `
      uniform sampler2D waterReflection;
      uniform sampler2D waterRefraction;
      uniform sampler2D waterDepthMap;
      uniform vec2 waterReflectionTexel;
      uniform vec2 waterRefractionTexel;
      uniform vec3 waterAttenuation;
      varying vec4 waterReflectionCoord;
      varying vec4 waterRefractionCoord;
      varying vec3 waterWorldPosition;
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 flatNormal = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
      vec2 distortion = (normal.xy - flatNormal.xy) * 0.012;
      vec2 reflectionUV = waterReflectionCoord.xy / waterReflectionCoord.w;
      vec2 refractionUV = waterRefractionCoord.xy / waterRefractionCoord.w;
      vec2 reflectionMargin = waterReflectionTexel * 2.0;
      vec2 refractionMargin = waterRefractionTexel * 2.0;
      vec3 reflected = texture2D(waterReflection, clamp(reflectionUV + distortion, reflectionMargin, 1.0 - reflectionMargin)).rgb;
      vec3 underwater = texture2D(waterRefraction, clamp(refractionUV - distortion, refractionMargin, 1.0 - refractionMargin)).rgb;
      float depth = texture2D(waterDepthMap, waterWorldPosition.xz / ${DEPTH_MAP_WORLD_SIZE.toFixed(1)} + 0.5).g * ${MAX_SEABED_DEPTH.toFixed(1)};
      vec3 absorption = pow(waterAttenuation, vec3(depth / 25.0));
      vec3 toEye = normalize(cameraPosition - waterWorldPosition);
      vec3 worldNormal = transformNormalByInverseViewMatrix(normal, viewMatrix);
      float facing = clamp(dot(toEye, worldNormal), 0.0, 1.0);
      float fresnel = 0.02037 + 0.97963 * pow(1.0 - facing, 5.0);
      outgoingLight = mix(underwater * diffuseColor.rgb * absorption, reflected, fresnel) + reflectedLight.directSpecular;
      #include <opaque_fragment>
    `);
  };
  const surface = new THREE.Mesh(geometry, material);
  surface.name = 'ocean-surface';
  surface.receiveShadow = true;
  surface.onBeforeRender = (_renderer, currentScene, camera) => optics.render(currentScene, camera, surface);
  scene.add(surface);

  return {
    heightAt(x, z, clock) { return sampleOceanHeight(x, z, clock, surface.position.x, surface.position.z); },
    update(game, clock) {
      time.value = clock;
      surface.position.x = Math.round(game.x / 8) * 8;
      surface.position.z = Math.round(game.z / 8) * 8;
    },
    dispose() {
      optics.dispose();
      normalMap.dispose();
      seabed.depthMap.dispose();
      environment.dispose();
      scene.environment = null;
      scene.background = null;
    },
  };
}
