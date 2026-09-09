import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisibleClock, prepareShaders, waitForGpu } from './scene-startup.js';

test('startup deadlines count foreground time, including when a page is initially hidden', () => {
  const page = new EventTarget();
  page.hidden = true;
  const abort = new AbortController();
  let now = 0;
  const clock = createVisibleClock(page, abort.signal, () => now);
  now = 70_000;
  assert.equal(clock(), 0);
  page.hidden = false;
  page.dispatchEvent(new Event('visibilitychange'));
  now += 20;
  assert.equal(clock(), 20);
  page.hidden = true;
  page.dispatchEvent(new Event('visibilitychange'));
  now += 70_000;
  assert.equal(clock(), 20);
  page.hidden = false;
  page.dispatchEvent(new Event('visibilitychange'));
  now += 30;
  assert.equal(clock(), 50);
  abort.abort();
});

test('returning from a hidden tab does not time out already completed shader programs', async () => {
  const page = new EventTarget();
  page.hidden = false;
  const abort = new AbortController();
  let now = 0;
  const clock = createVisibleClock(page, abort.signal, () => now);
  const gl = { LINK_STATUS: 1, isContextLost: () => false, getProgramParameter: () => true };
  const renderer = { compile() {}, getContext: () => gl, extensions: { get: () => null }, info: { programs: [{ program: {} }] } };
  await prepareShaders(renderer, {}, {}, abort.signal, async () => {
    page.hidden = true;
    page.dispatchEvent(new Event('visibilitychange'));
    now += 70_000;
    page.hidden = false;
    page.dispatchEvent(new Event('visibilitychange'));
  }, clock);
  assert.equal(clock(), 0);
  abort.abort();
});

test('first-frame completion waits without blocking and always releases its GPU fence', async () => {
  const abort = new AbortController();
  let deleted = 0;
  let waits = 0;
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 1, CONDITION_SATISFIED: 2, ALREADY_SIGNALED: 3, WAIT_FAILED: 4,
    fenceSync: () => ({}), flush() {}, isContextLost: () => false,
    clientWaitSync: () => (++waits === 2 ? 2 : 5), deleteSync() { deleted++; },
  };
  await waitForGpu({ getContext: () => gl }, abort.signal, async () => {}, () => performance.now());
  assert.equal(waits, 2);
  assert.equal(deleted, 1);
  await assert.rejects(waitForGpu({ getContext: () => gl }, abort.signal, async () => { abort.abort(); }, () => performance.now()), { name: 'AbortError' });
  assert.equal(deleted, 2);
});

test('shader preparation yields until compilation finishes, without drawing the scene', async () => {
  let yields = 0;
  const gl = {
    LINK_STATUS: 1, isContextLost: () => false,
    getProgramParameter(_program, parameter) { return parameter === 1 || yields >= 2; },
  };
  let compiled = 0;
  const renderer = {
    compile() { compiled++; },
    getContext: () => gl,
    extensions: { get: () => ({ COMPLETION_STATUS_KHR: 2 }) },
    info: { programs: [{ program: {} }] },
  };
  await prepareShaders(renderer, {}, {}, new AbortController().signal, async () => { yields++; }, () => performance.now());
  assert.equal(compiled, 1);
  assert.ok(yields >= 2);
});

test('shader preparation cancels instead of polling a lost or disposed context forever', async () => {
  const abort = new AbortController();
  const renderer = {
    compile() {}, getContext: () => ({ isContextLost: () => false, getProgramParameter: () => false }),
    extensions: { get: () => ({ COMPLETION_STATUS_KHR: 2 }) }, info: { programs: [{ program: {} }] },
  };
  await assert.rejects(prepareShaders(renderer, {}, {}, abort.signal, async () => { abort.abort(); }, () => performance.now()), { name: 'AbortError' });
});

test('invalid shader programs fail explicitly, including on browsers without parallel compilation', async () => {
  const gl = { LINK_STATUS: 1, isContextLost: () => false, getProgramParameter: () => false, getProgramInfoLog: () => 'test shader error' };
  const renderer = { compile() {}, getContext: () => gl, extensions: { get: () => null }, info: { programs: [{ program: {} }] } };
  await assert.rejects(prepareShaders(renderer, {}, {}, new AbortController().signal, async () => {}, () => performance.now()), /SEA_SHADER_FAILED/);
});
