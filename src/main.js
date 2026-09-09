import './styles.css';
import { createGame, stepGame } from './game.js';
import { mountUI, updateUI, updateLoading, formatTime, icon } from './ui.js';
import { createVisibleClock, yieldToBrowser } from './scene-startup.js';

const lifetime = new AbortController();
const STARTUP_TIMEOUT_MS = 60_000;
const STARTUP_TIMEOUT_CHECK_MS = 250;
const signal = lifetime.signal;
const startupClock = createVisibleClock(document, signal);
const listen = (target, type, listener, options = {}) => target.addEventListener(type, listener, { ...options, signal });
const refs = mountUI(document.querySelector('#app'));
refs.stage.setAttribute('aria-busy', 'true');
refs.stage.querySelectorAll('button, input').forEach((element) => {
  element.disabled = true;
});
let game = createGame();
let world;
const keys = new Set();
const touchRudders = new Map();
let helpWasSailing = false;
let lastFrame = 0;
let lastUI = 0;
let visualTime = 0;
let dragging = null;
let windVisible = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let disposed = false;
let failed = false;

function clearControls() {
  keys.clear();
  touchRudders.clear();
  dragging = null;
  document.querySelectorAll('[data-rudder]').forEach((button) => button.classList.remove('held'));
}

function setMode(mode) {
  game.mode = mode;
  refs.stage.dataset.mode = mode;
  const inVoyage = mode !== 'ready';
  refs.root.classList.toggle('in-voyage', inVoyage);
  refs['site-header'].inert = inVoyage;
  clearControls();
  const overlay = mode === 'paused' || mode === 'finished';
  refs['state-overlay'].hidden = !overlay;
  refs['pause-button'].innerHTML = icon(mode === 'paused' ? 'play' : 'pause');
  refs['pause-button'].setAttribute('aria-label', mode === 'paused' ? 'Продолжить' : 'Пауза');
  refs['pause-button'].title = mode === 'paused' ? 'Продолжить' : 'Пауза';
  refs['finish-stats'].hidden = mode !== 'finished';
  if (mode === 'finished') {
    refs['state-eyebrow'].textContent = 'ПЯТЬ БУЁВ. ОДНО МАЛЕНЬКОЕ ПРИКЛЮЧЕНИЕ.';
    refs['state-title'].textContent = 'Ветер на твоей стороне.';
    refs['state-description'].textContent = 'Маршрут пройден. Теперь ты знаешь: чтобы двигаться вперёд, не всегда нужно идти прямо.';
    refs['finish-stats'].innerHTML =
      `<div><strong>${formatTime(game.elapsed)}</strong><span>в море</span></div><div><strong>${(game.distance / 1000).toFixed(2)} км</strong><span>под парусом</span></div><div><strong>${(game.maxSpeed / 0.514444).toFixed(1)} узл</strong><span>лучший ход</span></div>`;
    refs['resume-button'].innerHTML = `Ещё одно путешествие ${icon('arrow')}`;
  } else if (mode === 'paused') {
    refs['state-eyebrow'].textContent = 'МОЖНО НЕ СПЕШИТЬ';
    refs['state-title'].textContent = 'На тихой воде';
    refs['state-description'].textContent = 'Ветер подождёт. Продолжим, когда будешь готов.';
    refs['resume-button'].innerHTML = `Продолжить ${icon('play')}`;
  }
  if (overlay && !refs['help-dialog'].open) refs['resume-button'].focus({ preventScroll: true });
  if (mode === 'sailing') document.activeElement?.blur();
  updateUI(refs, game);
}

function restart() {
  game = createGame();
  world.resetVoyage();
  setMode('ready');
  refs['start-button'].focus({ preventScroll: true });
}

function togglePause() {
  if (game.mode === 'sailing') setMode('paused');
  else if (game.mode === 'paused') setMode('sailing');
}

listen(refs['start-button'], 'click', () => setMode('sailing'));
listen(refs['pause-button'], 'click', togglePause);
listen(refs['resume-button'], 'click', () => (game.mode === 'finished' ? restart() : setMode('sailing')));
listen(refs['restart-button'], 'click', restart);
for (const key of ['main', 'jib']) {
  listen(refs[`${key}-trim`], 'input', (event) => {
    game[`${key}Trim`] = Number(event.target.value);
    updateUI(refs, game);
  });
  listen(refs[`${key}-hoist`], 'input', (event) => {
    if (game.mode !== 'sailing') return;
    game[`${key}HoistTarget`] = Number(event.target.value) / 100;
    updateUI(refs, game);
  });
}
function updateWindVisibility() {
  world.setWindVisible(windVisible);
  refs['wind-button'].setAttribute('aria-pressed', String(windVisible));
  refs['wind-button'].title = windVisible ? 'Скрыть линии ветра' : 'Показать линии ветра';
}
listen(refs['wind-button'], 'click', () => {
  windVisible = !windVisible;
  updateWindVisibility();
});
listen(refs['help-button'], 'click', () => {
  helpWasSailing = game.mode === 'sailing';
  if (helpWasSailing) setMode('paused');
  refs['help-dialog'].showModal();
});
listen(refs['close-help'], 'click', () => refs['help-dialog'].close());
listen(refs['help-done'], 'click', () => refs['help-dialog'].close());
listen(refs['help-dialog'], 'close', () => {
  if (helpWasSailing && !document.hidden) setMode('sailing');
  helpWasSailing = false;
});
listen(refs['help-dialog'], 'click', (event) => {
  if (event.target === refs['help-dialog']) {
    const bounds = refs['help-dialog'].getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)
      refs['help-dialog'].close();
  }
});
listen(refs['camera-button'], 'click', () => world.resetCamera());
refs['fullscreen-button'].hidden = !document.fullscreenEnabled;
listen(refs['fullscreen-button'], 'click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (cause) {
    console.error('FULLSCREEN_FAILED', { cause });
    refs['error-message'].textContent = 'FULLSCREEN_FAILED: Не удалось открыть игру на весь экран. Продолжай в обычном окне.';
    refs['error-message'].hidden = false;
  }
});
listen(document, 'fullscreenchange', () => {
  refs['fullscreen-button'].setAttribute('aria-label', document.fullscreenElement ? 'Выйти из полноэкранного режима' : 'На весь экран');
});

const gameplayKeys = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
listen(window, 'keydown', (event) => {
  if (refs['help-dialog'].open) return;
  const isInput = event.target instanceof HTMLInputElement;
  const isRange = isInput && event.target.type === 'range';
  const isButton = event.target instanceof HTMLButtonElement;
  if (event.code === 'Space' && (!isInput || isRange) && !isButton) {
    event.preventDefault();
    if (!event.repeat) togglePause();
    return;
  }
  if (event.code === 'Escape') {
    if (game.mode === 'sailing') setMode('paused');
    return;
  }
  // Preserve native arrow-key adjustment of the slider, but not at the cost of A/D steering.
  if (!gameplayKeys.includes(event.code) || (isInput && (!isRange || event.code.startsWith('Arrow'))) || game.mode !== 'sailing') return;
  event.preventDefault();
  keys.add(event.code);
});
listen(window, 'keyup', (event) => keys.delete(event.code));
listen(window, 'blur', () => {
  clearControls();
  if (game.mode === 'sailing') setMode('paused');
});
listen(document, 'visibilitychange', () => {
  lastFrame = 0;
  if (document.hidden && game.mode === 'sailing') setMode('paused');
});

document.querySelectorAll('[data-rudder]').forEach((button) => {
  listen(button, 'pointerdown', (event) => {
    if (game.mode !== 'sailing') return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    touchRudders.set(event.pointerId, Number(button.dataset.rudder));
    button.classList.add('held');
  });
  const release = (event) => {
    touchRudders.delete(event.pointerId);
    button.classList.remove('held');
  };
  listen(button, 'pointerup', release);
  listen(button, 'pointercancel', release);
  listen(button, 'lostpointercapture', release);
});

listen(refs.scene, 'pointerdown', (event) => {
  if (event.button !== 0) return;
  dragging = { id: event.pointerId, x: event.clientX };
  refs.scene.setPointerCapture(event.pointerId);
});
listen(refs.scene, 'pointermove', (event) => {
  if (!dragging || dragging.id !== event.pointerId || !world) return;
  world.rotate(-(event.clientX - dragging.x) * 0.007);
  dragging.x = event.clientX;
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
  listen(refs.scene, event, () => {
    dragging = null;
  });
listen(
  refs.scene,
  'wheel',
  (event) => {
    if (!world || !refs.loading.hidden) return;
    event.preventDefault();
    world.zoom(event.deltaY * 0.001);
  },
  { passive: false },
);

function showFatal(cause, code) {
  if (failed || disposed) return;
  failed = true;
  console.error(code, { cause });
  if (game.mode === 'sailing') setMode('paused');
  if (refs['help-dialog'].open) refs['help-dialog'].close();
  lifetime.abort(cause);
  world?.dispose();
  refs.stage.setAttribute('aria-busy', 'false');
  refs.loading.hidden = true;
  refs['state-overlay'].hidden = true;
  refs['error-message'].textContent =
    `${code}: Не удалось подготовить 3D-море. Обнови страницу. Если ошибка повторится, проверь подключение к сети и аппаратное ускорение браузера.`;
  refs['error-message'].hidden = false;
  refs.stage.dataset.mode = 'error';
  refs.stage.querySelectorAll('button, input').forEach((element) => {
    element.disabled = true;
  });
}

async function start() {
  const timeout = setInterval(() => {
    if (startupClock() >= STARTUP_TIMEOUT_MS)
      showFatal(new Error('Initial preparation exceeded 60 seconds of foreground time'), 'SEA_INIT_TIMEOUT');
  }, STARTUP_TIMEOUT_CHECK_MS);
  const cancelTimeout = () => clearInterval(timeout);
  signal.addEventListener('abort', cancelTimeout, { once: true });
  try {
    performance.mark('sailwind-startup');
    const checkpoint = async (completed, label) => {
      signal.throwIfAborted();
      updateLoading(refs, completed, label);
      await yieldToBrowser(signal);
    };
    await checkpoint(0, 'Загружаем навигацию');
    const { createScene } = await import('./scene.js');
    signal.throwIfAborted();
    world = await createScene(refs.scene, {
      checkpoint,
      signal,
      clock: startupClock,
      onContextLost: () => showFatal(new Error('WebGL context lost'), 'SEA_CONTEXT_LOST'),
    });
    updateWindVisibility();
    await world.prepare(game);
    await checkpoint(7, 'Проверяем готовность к выходу');
    await world.warmup(game);
    await checkpoint(8, 'Море готово. Попутного ветра!');
    signal.throwIfAborted();
    refs.loading.hidden = true;
    performance.mark('sailwind-ready');
    performance.measure('sailwind-startup', 'sailwind-startup', 'sailwind-ready');
    refs.stage.setAttribute('aria-busy', 'false');
    refs.stage.querySelectorAll('button, input').forEach((element) => {
      element.disabled = false;
    });
    updateUI(refs, game);
    world.renderer.setAnimationLoop((timestamp) => {
      try {
        const dt = lastFrame === 0 ? 1 / 60 : Math.min((timestamp - lastFrame) / 1000, 0.1);
        lastFrame = timestamp;
        if (document.hidden) return;
        const previousMode = game.mode;
        const right = keys.has('KeyD') || keys.has('ArrowRight');
        const left = keys.has('KeyA') || keys.has('ArrowLeft');
        const sailRight = keys.has('KeyS') || keys.has('ArrowDown');
        const sailLeft = keys.has('KeyW') || keys.has('ArrowUp');
        const jibRight = keys.has('KeyE');
        const jibLeft = keys.has('KeyQ');
        const touch = [...touchRudders.values()].reduce((sum, value) => sum + value, 0);
        stepGame(
          game,
          {
            rudder: Math.max(-1, Math.min(1, Number(right) - Number(left) + touch)),
            mainTrim: Number(sailRight) - Number(sailLeft),
            jibTrim: Number(jibRight) - Number(jibLeft),
          },
          dt,
        );
        if (previousMode !== game.mode) setMode(game.mode);
        if (game.mode !== 'paused' && game.mode !== 'finished') visualTime += dt;
        world.render(game, visualTime, dt);
        if (timestamp - lastUI > 80) {
          updateUI(refs, game);
          const marker = world.projectWaypoint(game);
          refs['waypoint-marker'].hidden = !marker?.visible || game.mode !== 'sailing';
          if (marker?.visible) {
            refs['waypoint-marker'].style.transform = `translate(${marker.x}px, ${marker.y}px) translate(-50%, -100%)`;
          }
          lastUI = timestamp;
        }
      } catch (cause) {
        showFatal(cause, 'SEA_RENDER_FAILED');
      }
    });
  } catch (cause) {
    world?.dispose();
    showFatal(cause, 'SEA_INIT_FAILED');
  } finally {
    cancelTimeout();
    signal.removeEventListener('abort', cancelTimeout);
  }
}

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposed = true;
    lifetime.abort();
    world?.dispose();
  });
void start();
