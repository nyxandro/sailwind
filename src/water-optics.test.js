import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACESFilmicToneMapping,
  Group,
  Matrix4,
  Mesh,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import { createWaterOptics } from './water-optics.js';
import { SURFACE_EFFECT_LAYER } from './world.js';

test('preparing offscreen programs restores the target and tone mapping when compilation fails', async (t) => {
  const { optics, renderer, originalTarget } = setup(t);
  const failure = new Error('test compile failure');
  renderer.compile = () => {
    assert.equal(renderer.toneMapping, NoToneMapping);
    assert.notEqual(renderer.target, originalTarget);
    throw failure;
  };
  await assert.rejects(
    optics.prepare(
      new Scene(),
      new PerspectiveCamera(),
      new AbortController().signal,
      async () => {},
      () => performance.now(),
    ),
    (cause) => cause === failure,
  );
  assert.equal(renderer.target, originalTarget);
  assert.equal(renderer.face, 2);
  assert.equal(renderer.mip, 1);
  assert.equal(renderer.toneMapping, ACESFilmicToneMapping);
});

function setup(t) {
  const scene = new Scene();
  const surface = new Mesh();
  scene.add(surface);
  const originalTarget = new WebGLRenderTarget(320, 200);
  const viewport = new Vector4(3, 4, 1280, 850);
  const activeViewport = originalTarget.viewport.clone();
  const calls = [];
  const renderer = {
    xr: { enabled: true },
    shadowMap: { autoUpdate: true },
    toneMapping: ACESFilmicToneMapping,
    autoClear: true,
    target: originalTarget,
    face: 2,
    mip: 1,
    viewport: viewport.clone(),
    currentViewport: activeViewport.clone(),
    gpuViewport: activeViewport.clone(),
    state: {
      buffers: { depth: { setMask() {} } },
      viewport(value) {
        renderer.gpuViewport.copy(value);
      },
    },
    getDrawingBufferSize(out) {
      return out.set(1280, 850);
    },
    getRenderTarget() {
      return this.target;
    },
    getActiveCubeFace() {
      return this.face;
    },
    getActiveMipmapLevel() {
      return this.mip;
    },
    getViewport(out) {
      return out.copy(this.viewport);
    },
    getCurrentViewport(out) {
      return out.copy(this.currentViewport);
    },
    setViewport(value) {
      this.viewport.copy(value);
      this.currentViewport.copy(value).multiplyScalar(1.75).round();
      this.state.viewport(this.currentViewport);
    },
    setRenderTarget(target, face = 0, mip = 0) {
      this.target = target;
      this.face = face;
      this.mip = mip;
      if (target) this.currentViewport.copy(target.viewport);
      else this.currentViewport.copy(this.viewport).multiplyScalar(1.75).floor();
      this.state.viewport(this.currentViewport);
    },
    render(_scene, camera) {
      assert.equal(surface.visible, false, 'Water must never render into its own reflection/refraction');
      assert.equal(this.toneMapping, NoToneMapping, 'Offscreen colors stay linear until final output');
      calls.push({ camera: camera.clone(), target: this.target });
    },
  };
  const optics = createWaterOptics(renderer);
  t.after(() => {
    optics.dispose();
    originalTarget.dispose();
    surface.geometry.dispose();
    surface.material.dispose();
  });
  return { scene, surface, renderer, optics, calls, originalTarget, viewport, activeViewport };
}

test('reflection uses a mirrored eye and direction, not a copy of the overhead view', (t) => {
  const { scene, surface, optics, calls } = setup(t);
  for (const angle of [0, 0.7, 2.4]) {
    const camera = new PerspectiveCamera(43, 1280 / 850, 0.5, 2200);
    camera.position.set(Math.sin(angle) * 45, 28, Math.cos(angle) * 45);
    camera.lookAt(0, 2, 0);
    camera.setViewOffset(1280, 850, -75, 0, 1280, 850);
    camera.updateMatrixWorld();
    optics.render(scene, camera, surface);
    const mirror = calls.at(-2).camera;
    const actualEye = new Vector3().setFromMatrixPosition(mirror.matrixWorld);
    assert.ok(actualEye.distanceTo(new Vector3(camera.position.x, -camera.position.y, camera.position.z)) < 1e-8);
    const expectedDirection = camera.getWorldDirection(new Vector3()).reflect(new Vector3(0, 1, 0));
    assert.ok(mirror.getWorldDirection(new Vector3()).distanceTo(expectedDirection) < 1e-8);
    const projection = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const expectedUV = new Vector4(0, 0, 0, 1).applyMatrix4(projection);
    const actualUV = new Vector4(0, 0, 0, 1).applyMatrix4(optics.uniforms.waterReflectionMatrix.value);
    assert.ok(Math.abs(actualUV.x / actualUV.w - ((expectedUV.x / expectedUV.w) * 0.5 + 0.5)) < 1e-8);
    assert.ok(Math.abs(actualUV.y / actualUV.w - ((expectedUV.y / expectedUV.w) * 0.5 + 0.5)) < 1e-8);
  }
});

test('both water meshes are excluded from reflection and refraction together', (t) => {
  const { scene, surface, renderer, optics } = setup(t);
  const water = new Group();
  const far = new Mesh();
  t.after(() => {
    far.geometry.dispose();
    far.material.dispose();
  });
  water.add(surface, far);
  scene.add(water);
  let renders = 0;
  renderer.render = () => {
    assert.equal(water.visible, false);
    const visible = [];
    scene.traverseVisible((object) => visible.push(object));
    assert.ok(!visible.includes(surface) && !visible.includes(far));
    renders++;
  };
  const camera = new PerspectiveCamera();
  camera.position.set(0, 28, 40);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  optics.render(scene, camera, water);
  assert.equal(renders, 2);
  assert.equal(water.visible, true);
});

test('the underwater pass excludes the deck, while the reflection excludes the seabed', (t) => {
  const { scene, surface, optics, calls } = setup(t);
  const camera = new PerspectiveCamera(43, 1.5, 0.5, 2200);
  camera.layers.enable(SURFACE_EFFECT_LAYER);
  camera.position.set(25, 28, 45);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  optics.render(scene, camera, surface);
  const [reflection, refraction] = calls;
  assert.equal(camera.layers.isEnabled(SURFACE_EFFECT_LAYER), true);
  assert.equal(reflection.camera.layers.isEnabled(SURFACE_EFFECT_LAYER), false);
  assert.equal(refraction.camera.layers.isEnabled(SURFACE_EFFECT_LAYER), false);
  const projectZ = (position, view) =>
    position.clone().applyMatrix4(new Matrix4().multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse)).z;
  assert.ok(projectZ(new Vector3(0, 3, 0), reflection.camera) > -1);
  assert.ok(projectZ(new Vector3(0, -6, 0), reflection.camera) < -1);
  assert.ok(projectZ(new Vector3(0, 3, 0), refraction.camera) < -1);
  assert.ok(projectZ(new Vector3(0, -6, 0), refraction.camera) > -1);
  assert.ok(new Vector3().setFromMatrixPosition(refraction.camera.matrixWorld).distanceTo(camera.position) < 1e-8);
  assert.ok(reflection.target.width <= 512 && reflection.target.height <= 512);
  assert.equal(refraction.target.width, 1280);
  assert.equal(refraction.target.height, 850);
  assert.equal(refraction.target.samples, 2);
});

test('offscreen passes restore renderer state and visibility even when rendering fails', (t) => {
  const { scene, surface, optics, renderer, originalTarget, viewport, activeViewport } = setup(t);
  const camera = new PerspectiveCamera();
  camera.position.set(0, 20, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const failure = new Error('test render failure');
  renderer.render = () => {
    throw failure;
  };
  assert.throws(
    () => optics.render(scene, camera, surface),
    (error) => error === failure,
  );
  assert.equal(surface.visible, true);
  assert.equal(renderer.target, originalTarget);
  assert.equal(renderer.face, 2);
  assert.equal(renderer.mip, 1);
  assert.equal(renderer.xr.enabled, true);
  assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(renderer.toneMapping, ACESFilmicToneMapping);
  assert.deepEqual(renderer.viewport, viewport);
  assert.deepEqual(renderer.gpuViewport, activeViewport);
});

test('restoring an offscreen viewport does not apply the canvas pixel ratio a second time', (t) => {
  const { scene, surface, optics, renderer, viewport, activeViewport } = setup(t);
  const camera = new PerspectiveCamera();
  camera.position.set(0, 28, 40);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  optics.render(scene, camera, surface);
  assert.deepEqual(renderer.gpuViewport, activeViewport);
  assert.deepEqual(renderer.viewport, viewport);
});

test('underwater resolution follows device pixels independently from the cheaper reflection', (t) => {
  const { scene, surface, optics, renderer, calls } = setup(t);
  const camera = new PerspectiveCamera();
  camera.position.set(0, 28, 40);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  for (const [width, height, underwaterWidth, underwaterHeight] of [
    [3840, 2160, 2048, 1152],
    [780, 1688, 780, 1688],
    [390, 844, 390, 844],
  ]) {
    renderer.getDrawingBufferSize = (out) => out.set(width, height);
    optics.render(scene, camera, surface);
    const reflection = calls.at(-2).target;
    const refraction = calls.at(-1).target;
    assert.ok(Math.max(reflection.width, reflection.height) <= 512);
    assert.equal(refraction.width, underwaterWidth);
    assert.equal(refraction.height, underwaterHeight);
    assert.equal(optics.uniforms.waterReflectionTexel.value.x, 1 / reflection.width);
    assert.equal(optics.uniforms.waterRefractionTexel.value.x, 1 / refraction.width);
    assert.equal(optics.uniforms.waterRefractionTexel.value.y, 1 / refraction.height);
  }
});
