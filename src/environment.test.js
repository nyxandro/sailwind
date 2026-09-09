import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CubeUVReflectionMapping, HalfFloatType, LinearSRGBColorSpace } from 'three';
import { loadEnvironment } from './environment.js';

test('the baked sky is a full-resolution linear HDR atlas, ready without PMREM generation', async (t) => {
  const bytes = await readFile(new URL('../public/environment.exr', import.meta.url));
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
  const texture = await loadEnvironment('/environment.exr', new AbortController().signal);
  assert.equal(texture.image.width, 768);
  assert.equal(texture.image.height, 1024);
  assert.equal(texture.type, HalfFloatType);
  assert.equal(texture.mapping, CubeUVReflectionMapping);
  assert.equal(texture.colorSpace, LinearSRGBColorSpace);
  assert.equal(texture.flipY, false);
  assert.equal(texture.generateMipmaps, false);
  texture.dispose();
});

test('a missing sky fails loading instead of silently generating another expensive environment', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  await assert.rejects(loadEnvironment('/environment.exr', new AbortController().signal), /SEA_ENVIRONMENT_FAILED/);
});

test('cancelled sky loading does not create a texture', async (t) => {
  const abort = new AbortController();
  abort.abort();
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Fetch must not start'); });
  await assert.rejects(loadEnvironment('/environment.exr', abort.signal), { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 0);
});
