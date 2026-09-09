import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { radians } from '../world.js';

export function disposeYachtModel(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of [].concat(object.material)) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

export function bindYachtModel(group) {
  const required = (name) => {
    const object = group.getObjectByName(name);
    if (!object) throw new Error(`YACHT_MODEL_INVALID: Required part "${name}" is missing from the yacht model`);
    return object;
  };
  required('yacht-hull');
  const rudders = ['rudder-port', 'rudder-starboard'].map(required);
  const helms = ['helm-port', 'helm-starboard'].map(required);
  group.traverse((object) => {
    if (object.isMesh) object.castShadow = object.receiveShadow = true;
  });
  return { group, rudders, helms };
}

export async function loadYachtModel(url, signal) {
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`YACHT_MODEL_FAILED: Yacht model request failed with status ${response.status}`);
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  let gltf;
  try {
    gltf = await new GLTFLoader().parseAsync(bytes, '');
    signal.throwIfAborted();
    return bindYachtModel(gltf.scene);
  } catch (cause) {
    if (gltf) disposeYachtModel(gltf.scene);
    if (signal.aborted) throw signal.reason;
    throw new Error('YACHT_MODEL_FAILED: Unable to prepare the yacht model; check the exported GLB', { cause });
  }
}

export function setHelm(hull, rudder) {
  for (const blade of hull.rudders) blade.rotation.y = radians(rudder * 30);
  for (const wheel of hull.helms) wheel.rotation.z = -rudder * Math.PI * 0.75;
}
