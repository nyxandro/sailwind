import { CubeUVReflectionMapping } from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export async function loadEnvironment(url, signal) {
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`SEA_ENVIRONMENT_FAILED: Sky atlas request failed with status ${response.status}`);
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  const texture = new EXRLoader().createDataTexture(bytes);
  if (texture.image.width !== 768 || texture.image.height !== 1024) {
    texture.dispose();
    throw new Error('SEA_ENVIRONMENT_INVALID: Expected the baked 768 x 1024 sky atlas');
  }
  texture.mapping = CubeUVReflectionMapping;
  return texture;
}
