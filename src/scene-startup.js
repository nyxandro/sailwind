const GRAPHICS_PREPARATION_TIMEOUT = 30_000;

export function createVisibleClock(page, signal, now = () => performance.now()) {
  let elapsed = 0;
  let since = page.hidden ? null : now();
  page.addEventListener('visibilitychange', () => {
    const current = now();
    if (since !== null) elapsed += current - since;
    since = page.hidden ? null : current;
  }, { signal });
  return () => elapsed + (since === null ? 0 : now() - since);
}

export function yieldToBrowser(signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let timer;
    const abort = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    // A timer after RAF lets the browser paint the progress before the next task.
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, 0);
    });
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function prepareShaders(renderer, scene, camera, signal, pause, clock) {
  signal.throwIfAborted();
  renderer.compile(scene, camera);
  const gl = renderer.getContext();
  const parallel = renderer.extensions.get('KHR_parallel_shader_compile');
  const pending = new Set(renderer.info.programs.map(({ program }) => program));
  const started = clock();
  // compileAsync has no cancellation; poll the native WebGL status so context
  // loss and hot reload can stop preparation before disposing its resources.
  while (pending.size > 0) {
    await pause();
    signal.throwIfAborted();
    if (gl.isContextLost()) throw new Error('SEA_CONTEXT_LOST: WebGL context was lost during preparation');
    if (clock() - started > GRAPHICS_PREPARATION_TIMEOUT) {
      throw new Error('SEA_SHADER_TIMEOUT: Graphics preparation exceeded 30 seconds of foreground time');
    }
    for (const program of pending) {
      if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) continue;
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('SEA_SHADER_FAILED: A graphics program could not be linked', { cause: new Error(gl.getProgramInfoLog(program)) });
      }
      pending.delete(program);
      if (!parallel) break;
    }
  }
}

export async function waitForGpu(renderer, signal, pause, clock) {
  signal.throwIfAborted();
  const gl = renderer.getContext();
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) throw new Error('SEA_GPU_SYNC_FAILED: Could not track completion of the first frame');
  const started = clock();
  try {
    gl.flush();
    while (true) {
      await pause();
      signal.throwIfAborted();
      const state = gl.clientWaitSync(fence, 0, 0);
      if (state === gl.CONDITION_SATISFIED || state === gl.ALREADY_SIGNALED) return;
      if (state === gl.WAIT_FAILED || gl.isContextLost()) throw new Error('SEA_GPU_SYNC_FAILED: The graphics context failed during first-frame preparation');
      if (clock() - started > GRAPHICS_PREPARATION_TIMEOUT) throw new Error('SEA_GPU_TIMEOUT: First-frame preparation exceeded 30 seconds of foreground time');
    }
  } finally {
    gl.deleteSync(fence);
  }
}
