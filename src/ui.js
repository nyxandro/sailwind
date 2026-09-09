import { rigPower, sailingHint } from './game.js';
import { ISLANDS, ROUTE, SAILS, MAX_SAIL_ANGLE, radians, coastRadius } from './world.js';
import { YACHT_PHYSICS } from './motion.js';

const paths = {
  sail: '<path d="M11 3 3 16h8V3Zm4 4v9h6l-6-9ZM3 20h17l-3 3H6l-3-3Z"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h5a3 3 0 1 1-3 3"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  chevron: '<path d="m14 6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  flag: '<path d="M5 21V4m0 0c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>',
};

export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="${name === 'sail' ? 'currentColor' : 'none'}" stroke="${name === 'sail' ? 'none' : 'currentColor'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export function mountUI(root) {
  root.innerHTML = `
    <header id="site-header" class="site-header">
      <a class="brand" href="/" aria-label="Sailwind, начало игры">${icon('sail')}<span>sailwind<span class="brand-dot">.</span></span></a>
      <div class="header-description"><span class="small-line"></span> ПОЙМАЙ СВОЙ ВЕТЕР</div>
      <div class="header-actions"><span class="edition">SAILING EXPERIENCE / 01</span></div>
    </header>
    <button id="help-button" class="help-button" aria-label="Как играть?" title="Как играть?" aria-haspopup="dialog" aria-controls="help-dialog">${icon('help')}<span>Как играть?</span></button>

    <main class="ocean-stage" data-mode="ready">
      <div id="scene" class="scene"></div>
      <div class="scene-vignette" aria-hidden="true"></div>
      <div class="location"><span class="live-dot"></span><span>ЛАЗУРНЫЙ АРХИПЕЛАГ</span><span class="location-divider">/</span><span class="location-type">СВОБОДА ПОД ПАРУСОМ</span></div>

      <section class="intro" aria-labelledby="intro-title">
        <div class="eyebrow"><span>ВЫДОХНИ. ТЫ В МОРЕ.</span></div>
        <h1 id="intro-title">Только ты.<br>Яхта. <span>И ветер.</span></h1>
        <p class="intro-description">Никаких моторов. Никакой спешки.<br>Почувствуй ветер, наполни парус<br>и найди свой курс.</p>
        <button id="start-button" class="primary-button">Поднять паруса ${icon('arrow')}</button>
        <div class="intro-meta"><span><i></i> Лёгкий старт</span><span>5 буёв на пути</span></div>
        <div class="intro-rule"><span class="rule-symbol">↗</span><p>Ветер не изменить.<br><strong>Но можно настроить парус.</strong></p></div>
      </section>

      <section class="voyage-panel glass" aria-label="Маршрут">
        <div class="panel-heading"><span class="eyebrow">ТВОЙ ПЕРВЫЙ МАРШРУТ</span>${icon('flag')}</div>
        <h2 id="route-name">Попутный знак</h2>
        <p>Пройди рядом с отмеченным буем</p>
        <div class="route-progress">${ROUTE.map((_, i) => `<span data-step="${i}">${String(i + 1).padStart(2, '0')}</span>`).join('<i></i>')}</div>
        <div class="voyage-stats"><span><strong id="waypoint-distance">132</strong> м до буя</span><span id="elapsed">00:00</span></div>
      </section>

      <section class="wind-panel glass" aria-label="Ветер и компас">
        <div class="panel-heading"><span class="eyebrow">СЕЙЧАС НА МОРЕ</span><span class="weather-dot"></span></div>
        <div class="wind-reading">${icon('wind')}<strong id="wind-speed">12.0</strong><span>узлов<span class="wind-description">лёгкий бриз</span></span></div>
        <div class="compass">
          <svg viewBox="0 0 180 180" class="compass-dial" aria-hidden="true">
            <circle cx="90" cy="90" r="68" fill="none" stroke="currentColor" stroke-opacity=".17"/>
            ${Array.from({ length: 36 }, (_, i) => `<path d="M90 23v${i % 3 === 0 ? 7 : 3}" transform="rotate(${i * 10} 90 90)" stroke="currentColor" stroke-opacity="${i % 3 === 0 ? '.5' : '.25'}"/>`).join('')}
            <text x="90" y="13">С</text><text x="170" y="94">В</text><text x="90" y="178">Ю</text><text x="10" y="94">З</text>
            <g id="wind-sector"><path d="M90 90 57 43A58 58 0 0 1 123 43Z" fill="#d6a272" opacity=".16"/><path d="M90 30v26m-5-5 5 5 5-5" stroke="#ad784b" fill="none" stroke-width="2" stroke-linecap="round"/></g>
            <g id="heading-needle"><path d="m90 64 10 44-10-6-10 6Z" fill="#254f49"/><path d="M90 68v31" stroke="#e7e9d5" stroke-width="1"/></g>
            <circle cx="90" cy="90" r="3" fill="#f4f1df"/>
          </svg>
        </div>
        <div class="wind-caption"><span class="wind-arrow" id="current-arrow">↑</span> <span id="current-reading"></span></div>
      </section>

      <div id="waypoint-marker" class="waypoint-marker" hidden><span id="marker-number">01</span><span id="marker-distance">132 м</span><i></i></div>
      <div class="camera-tools"><button id="wind-button" class="round-button" aria-label="Линии ветра" aria-pressed="true" title="Скрыть линии ветра">${icon('wind')}</button><button id="camera-button" class="round-button" aria-label="Вернуть камеру" title="Вернуть камеру">${icon('compass')}</button><button id="fullscreen-button" class="round-button" aria-label="На весь экран" title="На весь экран">${icon('expand')}</button></div>

      <div class="sailing-feedback" id="sailing-feedback" role="status"><span class="feedback-symbol">${icon('wind')}</span><div><strong id="hint-title">Море ждёт тебя</strong><span id="hint-detail">Подними паруса, чтобы начать путешествие</span></div></div>

      <section class="instruments glass" aria-label="Приборы яхты">
        <div class="instrument speed-instrument"><span class="eyebrow" id="motion-label">СКОРОСТЬ</span><div class="instrument-value"><strong id="speed" title="Скорость относительно берега">0.0</strong><span>узл</span></div><div class="speed-bars" aria-hidden="true">${'<i></i>'.repeat(18)}</div></div>
        <div class="instrument course-instrument"><span class="eyebrow">НОС ЯХТЫ</span><div class="instrument-value"><strong id="heading">020</strong><span>°</span></div><span class="instrument-note" id="course-name">Северо-восток</span></div>
        ${[['main', 'W', 'S'], ['jib', 'Q', 'E']].map(([key, left, right]) => `
          <div class="instrument sail-instrument" data-sail="${key}">
            <div class="sail-heading"><label class="eyebrow" for="${key}-trim">${SAILS[key].label.toUpperCase()}</label><strong id="${key}-trim-value">+40°</strong></div>
            <input id="${key}-trim" type="range" min="${-MAX_SAIL_ANGLE}" max="${MAX_SAIL_ANGLE}" value="40" aria-label="${SAILS[key].label}: угол паруса"/>
            <div class="trim-labels"><span><kbd>${left}</kbd> Влево</span><span>0°</span><span>Вправо <kbd>${right}</kbd></span></div>
            <div class="power-label"><span class="power-dot"></span><span id="${key}-power-label">Тяга</span><strong id="${key}-power-value"></strong></div>
          </div>`).join('')}
      </section>

      <section class="chart-panel glass" aria-label="Карта маршрута">
        <div class="panel-heading"><span class="eyebrow">ТВОЙ МАЛЕНЬКИЙ МИР</span>${icon('compass')}</div>
        <canvas id="chart" width="480" height="300" aria-label="Мини-карта: острова, яхта и пять буёв маршрута" role="img"></canvas>
        <div class="chart-footer"><span><i class="map-boat-dot"></i> Ты здесь</span><span><i class="map-route-dot"></i> Маршрут</span><span>С ↑</span></div>
      </section>

      <div class="desktop-controls"><span><kbd>A</kbd><kbd>D</kbd> или <kbd>←</kbd><kbd>→</kbd> <span>руль</span></span><i></i><span>${icon('mouse')} <span>потяни море, чтобы оглядеться</span></span><i></i><span><kbd>Пробел</kbd> <span>пауза</span></span></div>
      <div class="touch-controls"><button data-rudder="-1" aria-label="Руль влево">${icon('chevron')}</button><span>ДЕРЖИ, ЧТОБЫ ПОВЕРНУТЬ</span><button data-rudder="1" aria-label="Руль вправо">${icon('chevron')}</button></div>
      <div class="session-controls"><button id="pause-button" class="round-button" aria-label="Пауза" title="Пауза">${icon('pause')}</button><button id="restart-button" class="round-button" aria-label="Начать заново" title="Начать заново">${icon('reset')}</button></div>

      <section class="state-overlay" id="state-overlay" hidden aria-labelledby="state-title">
        <div class="state-card"><span class="state-icon">${icon('sail')}</span><span class="eyebrow" id="state-eyebrow">МОЖНО НЕ СПЕШИТЬ</span><h2 id="state-title">На тихой воде</h2><p id="state-description">Ветер подождёт. Продолжим, когда будешь готов.</p><div id="finish-stats" class="finish-stats" hidden></div><button id="resume-button" class="primary-button">Продолжить ${icon('play')}</button></div>
      </section>
      <div id="error-message" class="error-message" role="alert" hidden></div>
      <section id="loading" class="loading" aria-labelledby="loading-title">
        <div class="loading-card">
          <span class="eyebrow">ПЕРЕД ВЫХОДОМ В МОРЕ</span>
          <div class="loading-horizon" aria-hidden="true"><span class="loading-sail">${icon('sail')}</span></div>
          <h2 id="loading-title">Ловим первый ветер.</h2>
          <div class="loading-caption"><span id="loading-status" role="status">Готовим яхту к выходу</span><span id="loading-count">0 / 8</span></div>
          <progress id="loading-progress" max="8" value="0" aria-label="Подготовка игры"></progress>
          <p>Готовим море и отражения на твоём устройстве.<br>В первый раз это может занять немного времени.</p>
        </div>
      </section>
    </main>


    <dialog id="help-dialog"><div class="dialog-inner">
      <button id="close-help" class="round-button dialog-close" aria-label="Закрыть инструкцию">${icon('close')}</button>
      <span class="eyebrow">ПЕРЕД ВЫХОДОМ В МОРЕ</span><h2>Почувствуй ветер.</h2>
      <p class="dialog-lead">Пройди пять буёв по порядку.<br>Планируй повороты: яхта весит ${(YACHT_PHYSICS.mass / 1000).toLocaleString('ru-RU')} тонны.</p>
      <div class="help-steps">
        <article><span>01</span><div><h3>Задай направление</h3><p><kbd>A</kbd> / <kbd>D</kbd> или стрелки управляют рулём. На телефоне удерживай экранные кнопки. Яхта начинает и заканчивает поворот постепенно.</p></div></article>
        <article><span>02</span><div><h3>Настрой каждый парус</h3><p><strong>Грот</strong>: <kbd>W</kbd> влево, <kbd>S</kbd> вправо. <strong>Стаксель</strong>: <kbd>Q</kbd> влево, <kbd>E</kbd> вправо. Можно использовать два ползунка. Диапазон от −90° слева до +90° справа; 0° вдоль яхты. Автоматики нет.</p></div></article>
        <article><span>03</span><div><h3>Учитывай инерцию и задний ход</h3><p>После потери тяги яхта продолжает скользить. Если паруса тянут назад, сначала она затормозит, затем пойдёт кормой вперёд, заметно медленнее. При движении назад относительно воды руль реагирует наоборот.</p></div></article>
        <article><span>04</span><div><h3>Прочитай ветер и течение</h3><p>Тонкие штрихи над водой летят по ветру; стрелка на компасе показывает, откуда он приходит. В бежевом секторе вперёд не пройти: измени курс или открой паруса поперёк ветра, чтобы отойти назад. Синяя стрелка под компасом показывает течение: оно несёт даже яхту без тяги.</p></div></article>
      </div>
      <div class="help-note">${icon('compass')}<p>Пройди светящиеся круги у буёв. Острова обходи: на мелководье яхта остановится. Скорость на приборе измеряется относительно берега. Это игровая модель, не тренажёр судовождения.</p></div>
      <button id="help-done" class="primary-button">Понятно, к морю ${icon('arrow')}</button>
    </div></dialog>
  `;

  const refs = {};
  refs.root = root;
  root.querySelectorAll('[id]').forEach((element) => { refs[element.id] = element; });
  refs.stage = root.querySelector('.ocean-stage');
  refs.steps = [...root.querySelectorAll('[data-step]')];
  refs.bars = [...root.querySelectorAll('.speed-bars i')];
  const context = refs.chart.getContext('2d');
  if (!context) throw new Error('CHART_INIT_FAILED: Canvas 2D is unavailable');
  refs.chartContext = context;
  return refs;
}

export function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function updateLoading(refs, completed, label) {
  refs['loading-progress'].value = completed;
  refs['loading-progress'].setAttribute('aria-valuetext', `${label}. Завершено этапов: ${completed} из 8`);
  refs['loading-status'].textContent = label;
  refs['loading-count'].textContent = `${completed} / 8`;
}

function drawChart(refs, game) {
  const ctx = refs.chartContext;
  const width = refs.chart.width;
  const height = refs.chart.height;
  const scale = Math.min(0.52, 175 / Math.max(350, Math.abs(game.x - 130)), 125 / Math.max(230, Math.abs(game.z + 100)));
  const map = (x, z) => [width / 2 + (x - 130) * scale, height / 2 + (z + 100) * scale];
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#527c7020';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ISLANDS.forEach((island) => {
    const [x, y] = map(island.x, island.z);
    ctx.fillStyle = '#cbd4b8';
    ctx.strokeStyle = '#b7c5aa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const angle = i / 16 * Math.PI * 2;
      const r = coastRadius(island, angle) * scale;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo(...map(0, 0));
  ROUTE.forEach((point) => ctx.lineTo(...map(point.x, point.z)));
  ctx.strokeStyle = '#739686';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ROUTE.forEach((point, i) => {
    const [x, y] = map(point.x, point.z);
    ctx.beginPath(); ctx.arc(x, y, i === game.waypoint ? 11 : 6, 0, Math.PI * 2);
    ctx.fillStyle = i < game.waypoint ? '#2b655b' : i === game.waypoint ? '#d9e6a1' : '#f4f1df';
    ctx.fill(); ctx.strokeStyle = '#71886c'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#506b5e'; ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x, y - 16);
  });
  const [x, y] = map(game.x, game.z);
  ctx.save(); ctx.translate(x, y); ctx.rotate(radians(game.heading));
  ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fillStyle = '#38726717'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
  ctx.fillStyle = '#214e47'; ctx.fill(); ctx.strokeStyle = '#f7f3e4'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
}

export function updateUI(refs, game) {
  const rig = rigPower(game);
  const groundSurge = game.velocityX * Math.sin(radians(game.heading)) - game.velocityZ * Math.cos(radians(game.heading));
  const astern = groundSurge < -0.1;
  const knots = game.groundSpeed / 0.514444 * (astern ? -1 : 1);
  refs['motion-label'].textContent = astern ? 'ХОД НАЗАД' : game.waterSpeed < 0.3 && game.groundSpeed > 0.08 ? 'ДРЕЙФ' : 'СКОРОСТЬ';
  refs.speed.textContent = knots.toFixed(1);
  const currentSpeed = Math.hypot(game.currentX, game.currentZ) / 0.514444;
  refs['current-reading'].textContent = `Течение ${currentSpeed.toFixed(1)} узл`;
  refs['current-arrow'].style.transform = `rotate(${Math.atan2(game.currentX, -game.currentZ) * 180 / Math.PI}deg)`;
  refs.heading.textContent = String(Math.round(game.heading) % 360).padStart(3, '0');
  refs['course-name'].textContent = ['Север', 'Северо-восток', 'Восток', 'Юго-восток', 'Юг', 'Юго-запад', 'Запад', 'Северо-запад'][Math.round(game.heading / 45) % 8];
  for (const key of ['main', 'jib']) {
    const trim = game[`${key}Trim`];
    const trimDegrees = Math.round(trim);
    const slider = refs[`${key}-trim`];
    refs[`${key}-trim-value`].textContent = `${trimDegrees > 0 ? '+' : ''}${trimDegrees}°`;
    slider.value = trim;
    slider.setAttribute('aria-valuetext', `${Math.abs(trimDegrees)}°, ${trimDegrees < 0 ? 'левый борт' : trimDegrees > 0 ? 'правый борт' : 'вдоль яхты'}`);
    const trimPosition = (trim + MAX_SAIL_ANGLE) / (MAX_SAIL_ANGLE * 2) * 100;
    slider.style.setProperty('--trim-start', `${Math.min(50, trimPosition)}%`);
    slider.style.setProperty('--trim-end', `${Math.max(50, trimPosition)}%`);
    const power = Math.round(rig[key].power * 100);
    refs[`${key}-power-value`].textContent = `${power}%`;
    refs[`${key}-power-label`].textContent = rig[key].drive < -0.03 ? 'Тянет назад' : power > 75 ? 'Ловит ветер' : power > 30 ? 'Слабая тяга' : 'Теряет ветер';
    refs[`${key}-power-value`].parentElement.dataset.tone = power < 40 ? 'warning' : 'good';
  }
  refs['wind-speed'].textContent = game.windSpeed.toFixed(1);
  refs['wind-sector'].setAttribute('transform', `rotate(${game.windDirection} 90 90)`);
  refs['heading-needle'].setAttribute('transform', `rotate(${game.heading} 90 90)`);
  refs.elapsed.textContent = formatTime(game.elapsed);
  const point = ROUTE[game.waypoint];
  if (point) {
    const distance = Math.round(Math.hypot(game.x - point.x, game.z - point.z));
    refs['waypoint-distance'].textContent = distance;
    refs['marker-distance'].textContent = `${distance} м`;
    refs['marker-number'].textContent = String(game.waypoint + 1).padStart(2, '0');
    refs['route-name'].textContent = point.name;
  }
  refs.steps.forEach((element, i) => {
    element.dataset.status = i < game.waypoint ? 'done' : i === game.waypoint ? 'active' : 'pending';
  });
  refs.bars.forEach((element, i) => { element.classList.toggle('filled', i < Math.abs(knots) / 12 * refs.bars.length); });
  if (game.mode !== 'ready') {
    const hint = sailingHint(game);
    // Avoid re-announcing the live region unless its message actually changes.
    if (refs['hint-title'].textContent !== hint.title || refs['hint-detail'].textContent !== hint.detail) {
      refs['hint-title'].textContent = hint.title;
      refs['hint-detail'].textContent = hint.detail;
    }
    refs['sailing-feedback'].dataset.tone = hint.tone;
  } else {
    refs['hint-title'].textContent = 'Море ждёт тебя';
    refs['hint-detail'].textContent = 'Подними паруса, чтобы начать путешествие';
    refs['sailing-feedback'].dataset.tone = 'good';
  }
  drawChart(refs, game);
}
