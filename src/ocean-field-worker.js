import { OCEAN_FIELD_STRIDE } from './ocean-field.js';
import { COARSE_OCEAN_COORDINATES } from './ocean-grid.js';

export function createOceanFieldWorker(worker, vertexCount, apply) {
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  let pending = null;
  let wanted = { x: 0, z: 0 };
  let current = null;
  let nextId = 0;
  let failure = null;
  let disposed = false;

  function detach() {
    worker.removeEventListener('message', receive);
    worker.removeEventListener('error', onError);
    worker.removeEventListener('messageerror', onError);
    worker.terminate();
  }
  function fail(error) {
    failure = error;
    detach();
    rejectReady(error);
  }
  function send() {
    if (pending || (current?.x === wanted.x && current.z === wanted.z)) return;
    pending = { ...wanted, id: nextId++ };
    worker.postMessage(pending);
  }
  function receive({ data }) {
    try {
      if (
        !pending ||
        data?.id !== pending.id ||
        data.x !== pending.x ||
        data.z !== pending.z ||
        !(data.field instanceof Float32Array) ||
        data.field.length !== vertexCount * OCEAN_FIELD_STRIDE ||
        !(data.coarseSamples instanceof Float32Array) ||
        data.coarseSamples.length !== data.field.length ||
        (!current &&
          (!(data.coarseField instanceof Float32Array) ||
            data.coarseField.length !== COARSE_OCEAN_COORDINATES.length ** 2 * OCEAN_FIELD_STRIDE))
      ) {
        throw new Error('OCEAN_FIELD_INVALID: Worker returned an unexpected wave field');
      }
      apply(data);
      current = pending;
      pending = null;
      resolveReady();
      send();
    } catch (cause) {
      fail(cause);
    }
  }
  function onError(event) {
    event.preventDefault?.();
    fail(new Error('OCEAN_FIELD_FAILED: The wave preparation worker failed', { cause: event }));
  }
  worker.addEventListener('message', receive);
  worker.addEventListener('error', onError);
  worker.addEventListener('messageerror', onError);
  send();
  return {
    ready,
    update(x, z) {
      if (failure) throw failure;
      if (disposed) throw new DOMException('Wave preparation was cancelled', 'AbortError');
      wanted = { x, z };
      send();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detach();
      rejectReady(new DOMException('Wave preparation was cancelled', 'AbortError'));
    },
  };
}
