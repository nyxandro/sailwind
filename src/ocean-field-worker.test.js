import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanFieldWorker } from './ocean-field-worker.js';
import { OCEAN_FIELD_STRIDE } from './ocean-field.js';
import { COARSE_OCEAN_COORDINATES } from './ocean-grid.js';

function setup() {
  const listeners = new Map();
  const sent = [];
  const applied = [];
  const worker = {
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    postMessage(value) {
      sent.push(value);
    },
    terminate() {
      this.terminated = true;
    },
  };
  const field = createOceanFieldWorker(worker, 4, (data) => applied.push(data));
  const coarseField = new Float32Array(COARSE_OCEAN_COORDINATES.length ** 2 * OCEAN_FIELD_STRIDE);
  const reply = () =>
    listeners.get('message')({
      data: {
        ...sent.at(-1),
        field: new Float32Array(4 * OCEAN_FIELD_STRIDE),
        coarseSamples: new Float32Array(4 * OCEAN_FIELD_STRIDE),
        coarseField,
      },
    });
  return { field, worker, sent, applied, listeners, reply };
}

test('only one field is computed at a time and rapid moves keep only the latest requested anchor', async () => {
  const { field, sent, applied, reply } = setup();
  field.update(0, 0);
  field.update(8, 0);
  field.update(16, -8);
  assert.equal(sent.length, 1);
  assert.equal(applied.length, 0);
  reply();
  await field.ready;
  assert.equal(applied.length, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].x, 16);
  assert.equal(sent[1].z, -8);
  reply();
  field.update(16, -8);
  assert.equal(sent.length, 2);
  field.dispose();
});

test('initial worker failure rejects loading rather than leaving a stuck progress bar', async () => {
  const { field, worker, listeners } = setup();
  const rejected = assert.rejects(field.ready, /OCEAN_FIELD_FAILED/);
  listeners.get('error')({ message: 'test worker failed', preventDefault() {} });
  await rejected;
  assert.throws(() => field.update(8, 0), /OCEAN_FIELD_FAILED/);
  assert.equal(worker.terminated, true);
});

test('malformed data never replaces a working ocean field', async () => {
  const { field, listeners, sent, applied } = setup();
  const rejected = assert.rejects(field.ready, /OCEAN_FIELD_INVALID/);
  listeners.get('message')({ data: { ...sent[0], field: new Float32Array(1) } });
  await rejected;
  assert.equal(applied.length, 0);
});

test('disposing during preparation terminates the worker and cancels the pending initialization', async () => {
  const { field, worker, listeners } = setup();
  const rejected = assert.rejects(field.ready, { name: 'AbortError' });
  field.dispose();
  field.dispose();
  await rejected;
  assert.equal(worker.terminated, true);
  assert.equal(listeners.size, 0);
});

test('the first message must include the fixed far-water field', async () => {
  const { field, listeners, sent, applied } = setup();
  const rejected = assert.rejects(field.ready, /OCEAN_FIELD_INVALID/);
  listeners.get('message')({
    data: {
      ...sent[0],
      field: new Float32Array(4 * OCEAN_FIELD_STRIDE),
      coarseSamples: new Float32Array(4 * OCEAN_FIELD_STRIDE),
    },
  });
  await rejected;
  assert.equal(applied.length, 0);
});

test('a later patch without seam coefficients fails without replacing the current water', async () => {
  const { field, listeners, sent, applied, reply, worker } = setup();
  reply();
  await field.ready;
  field.update(8, 0);
  listeners.get('message')({ data: { ...sent.at(-1), field: new Float32Array(4 * OCEAN_FIELD_STRIDE) } });
  assert.equal(applied.length, 1);
  assert.throws(() => field.update(8, 0), /OCEAN_FIELD_INVALID/);
  assert.equal(worker.terminated, true);
});
