import * as THREE from 'three';
import { oceanFieldShader, OCEAN_FIELD_STRIDE } from './ocean-field.js';
import { createOceanFieldWorker } from './ocean-field-worker.js';
import { createOceanState } from './ocean-state.js';
import { COARSE_OCEAN_COORDINATES, OCEAN_ANCHOR_STEP } from './ocean-grid.js';
import { yieldToBrowser } from './scene-startup.js';
import { loadEnvironment } from './environment.js';
import { createOceanGeometry, createFarOceanIndices } from './ocean-surface.js';
import { createSeabed, MAX_SEABED_DEPTH, DEPTH_MAP_WORLD_SIZE } from './seabed.js';
import { createWaterOptics } from './water-optics.js';

export async function createOcean(renderer, scene, checkpoint, signal) {
  const time = { value: 0 };
  const sinTime = { value: new THREE.Vector4() };
  const cosTime = { value: new THREE.Vector4() };
  const detailCenter = { value: new THREE.Vector2() };
  const detailRadius = { value: 0 };
  const state = createOceanState();
  let environment;
  let normalMap;
  let optics;
  let fieldWorker;
  let seabed;
  let viewsDirty = true;
  const dispose = () => {
    signal.removeEventListener('abort', abortWorker);
    fieldWorker?.dispose();
    optics?.dispose();
    normalMap?.dispose();
    seabed?.depthMap.dispose();
    environment?.dispose();
    scene.environment = null;
    scene.background = null;
  };
  const abortWorker = () => fieldWorker?.dispose();
  try {
    seabed = await createSeabed(() => yieldToBrowser(signal));
    scene.add(seabed.group);
    await checkpoint(2, 'Поднимаем волны');
    const geometry = createOceanGeometry();
    const surface = new THREE.Mesh(geometry, null);
    surface.name = 'ocean-surface';
    const farGeometry = createOceanGeometry(COARSE_OCEAN_COORDINATES);
    const farSurface = new THREE.Mesh(farGeometry, null);
    farSurface.name = 'ocean-far-surface';
    const water = new THREE.Group();
    water.name = 'ocean';
    water.add(surface, farSurface);
    scene.add(water);
    const buffers = [];
    let uploadedPatch;
    const farBuffer = new THREE.InterleavedBuffer(
      new Float32Array(farGeometry.attributes.position.count * OCEAN_FIELD_STRIDE),
      OCEAN_FIELD_STRIDE,
    );
    for (const prefix of ['ocean', 'oceanCoarse']) {
      const buffer = new THREE.InterleavedBuffer(
        new Float32Array(geometry.attributes.position.count * OCEAN_FIELD_STRIDE),
        OCEAN_FIELD_STRIDE,
      );
      buffer.setUsage(THREE.DynamicDrawUsage);
      buffers.push(buffer);
      for (const [i, name] of ['HeightSin', 'HeightCos', 'SlopeXSin', 'SlopeXCos', 'SlopeZSin', 'SlopeZCos'].entries()) {
        geometry.setAttribute(`${prefix}${name}`, new THREE.InterleavedBufferAttribute(buffer, 4, i * 4));
        farGeometry.setAttribute(`${prefix}${name}`, new THREE.InterleavedBufferAttribute(farBuffer, 4, i * 4));
      }
    }
    fieldWorker = createOceanFieldWorker(
      new Worker(new URL('./ocean-field.worker.js', import.meta.url), { type: 'module' }),
      geometry.attributes.position.count,
      (data) => state.accept(data),
    );
    signal.addEventListener('abort', abortWorker, { once: true });
    await fieldWorker.ready;
    await checkpoint(3, 'Собираем свет над морем');
    environment = await loadEnvironment(`${import.meta.env.BASE_URL}environment.exr`, signal);
    scene.environment = environment;
    scene.environmentIntensity = 0.12;
    scene.background = environment;

    const size = 256;
    const data = new Uint8Array(size * size * 4);
    const noise = (u, v, frequency) => {
      const x = u * frequency;
      const y = v * frequency;
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const hash = (a, b) => {
        const n =
          Math.sin((((a % frequency) + frequency) % frequency) * 127.1 + (((b % frequency) + frequency) % frequency) * 311.7) * 43758.5453;
        return n - Math.floor(n);
      };
      const sx = (x - ix) ** 2 * (3 - 2 * (x - ix));
      const sy = (y - iy) ** 2 * (3 - 2 * (y - iy));
      return THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), sx),
        THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx),
        sy,
      );
    };
    const ripple = (u, v) => noise(u, v, 4) * 0.6 + noise(u, v, 9) * 0.28 + noise(u, v, 19) * 0.12;
    const ripples = new Float64Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) ripples[y * size + x] = ripple(x / size, y / size);
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (ripples[y * size + ((x + 1) % size)] - ripples[y * size + ((x + size - 1) % size)]) * 20;
        const dy = (ripples[((y + 1) % size) * size + x] - ripples[((y + size - 1) % size) * size + x]) * 20;
        const n = new THREE.Vector3(-dx, -dy, 1).normalize();
        const i = (y * size + x) * 4;
        data[i] = (n.x * 0.5 + 0.5) * 255;
        data[i + 1] = (n.y * 0.5 + 0.5) * 255;
        data[i + 2] = (n.z * 0.5 + 0.5) * 255;
        data[i + 3] = 255;
      }
    }
    normalMap = new THREE.DataTexture(data, size, size);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.magFilter = THREE.LinearFilter;
    normalMap.minFilter = THREE.LinearMipmapLinearFilter;
    normalMap.generateMipmaps = true;
    normalMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    normalMap.needsUpdate = true;

    optics = createWaterOptics(renderer);
    // Screen-space transmission includes the deck; use clipped underwater and mirrored views instead.
    const material = new THREE.MeshPhysicalMaterial({
      color: '#c9ecec',
      roughness: 0.22,
      metalness: 0,
      transmission: 0,
      ior: 1.333,
      normalMap,
      normalScale: new THREE.Vector2(0.18, 0.18),
      envMapIntensity: 0,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, optics.uniforms, {
        waterDepthMap: { value: seabed.depthMap },
        waterAttenuation: { value: new THREE.Color('#2186b0') },
        oceanSinTime: sinTime,
        oceanCosTime: cosTime,
        oceanDetailCenter: detailCenter,
        oceanDetailRadius: detailRadius,
      });
      shader.uniforms.oceanTime = time;
      shader.vertexShader =
        oceanFieldShader +
        `
      uniform float oceanTime;
      uniform mat4 waterReflectionMatrix;
      uniform mat4 waterRefractionMatrix;
      varying vec4 waterReflectionCoord;
      varying vec4 waterRefractionCoord;
      varying vec3 waterWorldPosition;
    ` +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
        vec3 surface = oceanSurface((modelMatrix * vec4(position, 1.0)).xz);
        objectNormal = vec3(-surface.y, 1.0, -surface.z);`,
        )
        // Normalize after interpolation: refining a coarse triangle must not change its shading.
        .replace(
          '#include <normal_vertex>',
          THREE.ShaderChunk.normal_vertex.replace('vNormal = normalize( transformedNormal );', 'vNormal = transformedNormal;'),
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        transformed.y += surface.x;
        waterWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        waterReflectionCoord = waterReflectionMatrix * vec4(waterWorldPosition, 1.0);
        waterRefractionCoord = waterRefractionMatrix * vec4(waterWorldPosition, 1.0);`,
        )
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
        vec2 waterWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
        vNormalMapUv = waterWorldXZ * 0.12 + vec2(oceanTime * 0.016, oceanTime * 0.009);`,
        );
      shader.fragmentShader =
        `
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
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
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
    `,
      );
    };
    surface.material = material;
    surface.receiveShadow = true;
    farSurface.material = material;
    farSurface.receiveShadow = true;
    // The first water draw prepares both views after the main shadow pass.
    // Hide the whole group in those views, and do not repeat them for the other mesh.
    const renderViews = (_renderer, currentScene, camera) => {
      if (!viewsDirty) return;
      viewsDirty = false;
      optics.render(currentScene, camera, water);
    };
    surface.onBeforeRender = farSurface.onBeforeRender = renderViews;

    return {
      heightAt(x, z, clock) {
        return state.heightAt(x, z, clock);
      },
      async prepare(camera, clock) {
        await optics.prepare(scene, camera, signal, () => yieldToBrowser(signal), clock);
      },
      update(game, clock, delta) {
        viewsDirty = true;
        time.value = clock;
        const requestedX = Math.round(game.x / OCEAN_ANCHOR_STEP) * OCEAN_ANCHOR_STEP;
        const requestedZ = Math.round(game.z / OCEAN_ANCHOR_STEP) * OCEAN_ANCHOR_STEP;
        fieldWorker.update(requestedX, requestedZ);
        const frame = state.update(game.x, game.z, clock, delta);
        if (uploadedPatch !== frame.patch) {
          buffers[0].array.set(frame.patch.field);
          buffers[1].array.set(frame.patch.coarseSamples);
          for (const buffer of buffers) buffer.needsUpdate = true;
          const indices = createFarOceanIndices(frame.patch.x, frame.patch.z);
          if (!uploadedPatch) {
            farGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
            farBuffer.array.set(frame.coarseField);
            farBuffer.needsUpdate = true;
          } else {
            farGeometry.index.array.set(indices);
            farGeometry.index.needsUpdate = true;
          }
          surface.position.set(frame.patch.x, 0, frame.patch.z);
          uploadedPatch = frame.patch;
        }
        sinTime.value.fromArray(frame.clock.sin);
        cosTime.value.fromArray(frame.clock.cos);
        detailCenter.value.set(frame.detail.x, frame.detail.z);
        detailRadius.value = frame.detail.radius;
      },
      dispose,
    };
  } catch (cause) {
    dispose();
    throw cause;
  }
}
