import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Refractor } from 'three/addons/objects/Refractor.js';
import { SURFACE_EFFECT_LAYER } from './world.js';
import { prepareShaders } from './scene-startup.js';

const REFLECTION_MAX_SIZE = 512;
const REFRACTION_MAX_SIZE = 2048;

export function createWaterOptics(renderer) {
  const plane = new THREE.PlaneGeometry(1, 1);
  const options = { textureWidth: REFLECTION_MAX_SIZE, textureHeight: REFLECTION_MAX_SIZE, clipBias: 0.001, multisample: 0 };
  const reflection = new Reflector(plane, options);
  const refraction = new Refractor(plane, { ...options, multisample: 2 });
  for (const view of [reflection, refraction]) {
    view.rotation.x = -Math.PI / 2;
    view.updateMatrixWorld(true);
  }
  const worldToPlane = reflection.matrixWorld.clone().invert();
  const size = new THREE.Vector2();
  const uniforms = {
    waterReflection: { value: reflection.getRenderTarget().texture },
    waterRefraction: { value: refraction.getRenderTarget().texture },
    waterReflectionMatrix: { value: new THREE.Matrix4() },
    waterRefractionMatrix: { value: new THREE.Matrix4() },
    waterReflectionTexel: { value: new THREE.Vector2() },
    waterRefractionTexel: { value: new THREE.Vector2() },
  };

  return {
    uniforms,
    async prepare(scene, camera, signal, pause, clock) {
      const target = renderer.getRenderTarget();
      const face = renderer.getActiveCubeFace();
      const mip = renderer.getActiveMipmapLevel();
      const toneMapping = renderer.toneMapping;
      try {
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setRenderTarget(refraction.getRenderTarget());
        await prepareShaders(renderer, scene, camera, signal, pause, clock);
      } finally {
        renderer.toneMapping = toneMapping;
        renderer.setRenderTarget(target, face, mip);
      }
    },
    render(scene, camera, surface) {
      renderer.getDrawingBufferSize(size);
      // Fine underwater edges need display resolution; distorted reflections can stay cheaper.
      for (const [view, limit, texel] of [
        [reflection, REFLECTION_MAX_SIZE, uniforms.waterReflectionTexel],
        [refraction, REFRACTION_MAX_SIZE, uniforms.waterRefractionTexel],
      ]) {
        const scale = Math.min(1, limit / Math.max(size.x, size.y));
        const width = Math.max(1, Math.round(size.x * scale));
        const height = Math.max(1, Math.round(size.y * scale));
        view.getRenderTarget().setSize(width, height);
        texel.value.set(1 / width, 1 / height);
      }

      const target = renderer.getRenderTarget();
      const cubeFace = renderer.getActiveCubeFace();
      const mipLevel = renderer.getActiveMipmapLevel();
      const viewport = renderer.getCurrentViewport(new THREE.Vector4());
      const xrEnabled = renderer.xr.enabled;
      const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
      const toneMapping = renderer.toneMapping;
      const backgroundIntensity = scene.backgroundIntensity;
      const visible = surface.visible;
      try {
        // Neither pass may capture this surface and recursively sample its own image.
        surface.visible = false;
        reflection.getReflectionCamera(camera).layers.disable(SURFACE_EFFECT_LAYER);
        refraction.camera.layers.disable(SURFACE_EFFECT_LAYER);
        renderer.toneMapping = THREE.NoToneMapping;
        scene.backgroundIntensity = backgroundIntensity * scene.environmentIntensity;
        reflection.onBeforeRender(renderer, scene, camera);
        scene.backgroundIntensity = backgroundIntensity;
        refraction.onBeforeRender(renderer, scene, camera);
        // Native helpers produce plane-local projectors; the displaced ocean uses world coordinates.
        uniforms.waterReflectionMatrix.value.copy(reflection.material.uniforms.textureMatrix.value).multiply(worldToPlane);
        uniforms.waterRefractionMatrix.value.copy(refraction.material.uniforms.textureMatrix.value).multiply(worldToPlane);
      } finally {
        surface.visible = visible;
        reflection.visible = refraction.visible = true;
        scene.backgroundIntensity = backgroundIntensity;
        renderer.xr.enabled = xrEnabled;
        renderer.shadowMap.autoUpdate = shadowAutoUpdate;
        renderer.toneMapping = toneMapping;
        renderer.setRenderTarget(target, cubeFace, mipLevel);
        renderer.state.viewport(viewport);
      }
    },
    dispose() {
      reflection.dispose();
      refraction.dispose();
      plane.dispose();
    },
  };
}
