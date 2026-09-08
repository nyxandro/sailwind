import './styles.css';
import { createGame, stepGame } from './game.js';
import { createScene } from './scene.js';
import { mountUI, updateUI, formatTime, icon } from './ui.js';

const refs = mountUI(document.querySelector('#app'));
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
    refs['finish-stats'].innerHTML = `<div><strong>${formatTime(game.elapsed)}</strong><span>в море</span></div><div><strong>${(game.distance / 1000).toFixed(2)} км</strong><span>под парусом</span></div><div><strong>${(game.maxSpeed / 0.514444).toFixed(1)} узл</strong><span>лучший ход</span></div>`;
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

refs['start-button'].addEventListener('click', () => setMode('sailing'));
refs['pause-button'].addEventListener('click', togglePause);
refs['resume-button'].addEventListener('click', () => game.mode === 'finished' ? restart() : setMode('sailing'));
refs['restart-button'].addEventListener('click', restart);
for (const key of ['main', 'jib']) {
  refs[`${key}-trim`].addEventListener('input', (event) => {
    game[`${key}Trim`] = Number(event.target.value);
    updateUI(refs, game);
  });
}
function updateWindVisibility() {
  world.setWindVisible(windVisible);
  refs['wind-button'].setAttribute('aria-pressed', String(windVisible));
  refs['wind-button'].title = windVisible ? 'Скрыть линии ветра' : 'Показать линии ветра';
}
refs['wind-button'].addEventListener('click', () => {
  windVisible = !windVisible;
  updateWindVisibility();
});
refs['help-button'].addEventListener('click', () => {
  helpWasSailing = game.mode === 'sailing';
  if (helpWasSailing) setMode('paused');
  refs['help-dialog'].showModal();
});
refs['close-help'].addEventListener('click', () => refs['help-dialog'].close());
refs['help-done'].addEventListener('click', () => refs['help-dialog'].close());
refs['help-dialog'].addEventListener('close', () => {
  if (helpWasSailing && !document.hidden) setMode('sailing');
  helpWasSailing = false;
});
refs['help-dialog'].addEventListener('click', (event) => {
  if (event.target === refs['help-dialog']) {
    const bounds = refs['help-dialog'].getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) refs['help-dialog'].close();
  }
});
refs['camera-button'].addEventListener('click', () => world.resetCamera());
refs['fullscreen-button'].hidden = !document.fullscreenEnabled;
refs['fullscreen-button'].addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (cause) {
    console.error('FULLSCREEN_FAILED', { cause });
    refs['error-message'].textContent = 'FULLSCREEN_FAILED: Не удалось открыть игру на весь экран. Продолжай в обычном окне.';
    refs['error-message'].hidden = false;
  }
});
document.addEventListener('fullscreenchange', () => {
  refs['fullscreen-button'].setAttribute('aria-label', document.fullscreenElement ? 'Выйти из полноэкранного режима' : 'На весь экран');
});

const gameplayKeys = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
window.addEventListener('keydown', (event) => {
  if (refs['help-dialog'].open) return;
  const isInput = event.target instanceof HTMLInputElement;
  const isRange = isInput && event.target.type === 'range';
  const isButton = event.target instanceof HTMLButtonElement;
  if (event.code === 'Space' && (!isInput || isRange) && !isButton) {
    event.preventDefault();
    if (!event.repeat) togglePause();
    return;
  }
  if (event.code === 'Escape') { if (game.mode === 'sailing') setMode('paused'); return; }
  // Preserve native arrow-key adjustment of the slider, but not at the cost of A/D steering.
  if (!gameplayKeys.includes(event.code) || (isInput && (!isRange || event.code.startsWith('Arrow'))) || game.mode !== 'sailing') return;
  event.preventDefault();
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => {
  clearControls();
  if (game.mode === 'sailing') setMode('paused');
});
document.addEventListener('visibilitychange', () => {
  lastFrame = 0;
  if (document.hidden && game.mode === 'sailing') setMode('paused');
});

document.querySelectorAll('[data-rudder]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
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
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});

refs.scene.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragging = { id: event.pointerId, x: event.clientX };
  refs.scene.setPointerCapture(event.pointerId);
});
refs.scene.addEventListener('pointermove', (event) => {
  if (!dragging || dragging.id !== event.pointerId || !world) return;
  world.rotate(-(event.clientX - dragging.x) * 0.007);
  dragging.x = event.clientX;
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) refs.scene.addEventListener(event, () => { dragging = null; });
refs.scene.addEventListener('wheel', (event) => {
  event.preventDefault();
  world.zoom(event.deltaY * 0.001);
}, { passive: false });

function showFatal(cause, code) {
  console.error(code, { cause });
  if (game.mode === 'sailing') setMode('paused');
  refs.loading.hidden = true;
  refs['state-overlay'].hidden = true;
  refs['error-message'].textContent = `${code}: Не удалось отобразить 3D-море. Включи аппаратное ускорение в браузере и обнови страницу.`;
  refs['error-message'].hidden = false;
  refs.stage.dataset.mode = 'error';
  refs.stage.querySelectorAll('button, input').forEach((element) => { element.disabled = true; });
}

try {
  world = createScene(refs.scene);
  updateWindVisibility();
  world.renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    world.renderer.setAnimationLoop(null);
    showFatal(new Error('WebGL context lost'), 'SEA_CONTEXT_LOST');
  });
  updateUI(refs, game);
  world.renderer.setAnimationLoop((timestamp) => {
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
    stepGame(game, {
      rudder: Math.max(-1, Math.min(1, Number(right) - Number(left) + touch)),
      mainTrim: Number(sailRight) - Number(sailLeft),
      jibTrim: Number(jibRight) - Number(jibLeft),
    }, dt);
    if (previousMode !== game.mode) setMode(game.mode);
    if (game.mode !== 'paused' && game.mode !== 'finished') visualTime += dt;
    world.render(game, visualTime, dt);
    refs.loading.hidden = true;
    if (timestamp - lastUI > 80) {
      updateUI(refs, game);
      const marker = world.projectWaypoint(game);
      refs['waypoint-marker'].hidden = !marker?.visible || game.mode !== 'sailing';
      if (marker?.visible) {
        refs['waypoint-marker'].style.transform = `translate(${marker.x}px, ${marker.y}px) translate(-50%, -100%)`;
      }
      lastUI = timestamp;
    }
  });
} catch (cause) {
  world?.dispose();
  showFatal(cause, 'SEA_INIT_FAILED');
}

if (import.meta.hot) import.meta.hot.dispose(() => { world?.dispose(); });
