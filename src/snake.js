/* Snake-Easter-Egg: wird von app.js erst bei Klick auf „Video- & Brettspiele"
   nachgeladen. Die ganze Seite ist das Spielfeld — sichtbare Inhalts-Elemente
   sind Hindernisse, überall warten Bugs. Das Spiel zeichnet auf ein
   viewport-großes fixed Canvas und rechnet in Dokument-Koordinaten; die Seite
   scrollt dem Schlangenkopf automatisch hinterher. Bestwert landet im
   localStorage. */
(() => {
  const CELL = 20;
  const START_LEN = 4;
  const BUG_COUNT = 12;
  const BEST_KEY = 'portfolio-snake-best';
  const AUDIO_BASE = '/snake-audio';
  const HIT_RADIUS = CELL * 0.28;
  const INTRO_BLINK_MS = 2600;
  const INTRO_DELAY_MS = 850;
  const START_SPEED = 155;
  const BUGS_PER_LEVEL = 5;
  const LEVEL_SPEED_FACTOR = 0.8;
  const LEVEL_AUDIO_RATE = 1.2;
  const MIN_SPEED = 55;
  const MAX_PLAYBACK_RATE = 2.4;

  // Nur Inhalts-Elemente — keine großen Container wie .card (Padding wäre sonst Hindernis).
  const CONTENT_SELECTOR = [
    '.hero__eyebrow',
    '.theme-toggle',
    '.lang-switch__btn',
    '.hero__name',
    '.hero__arrow-line',
    '.hero__arrow-head',
    '.hero__me-ring-path',
    '.hero__me-photo',
    '.hero__me-note',
    '.hero__role',
    '.hero__bio',
    '.hero__contact-list a',
    '.facet-chip',
    '.filter-status',
    '.section__heading',
    '.card__title',
    '.card__desc',
    '.card__media img',
    '.card__cta',
    '.about__photo img',
    '.about__photo figcaption',
    '.about__photo-pin',
    '.about__intro',
    '.about__label',
    '.about__interests li',
    '.skill-list__term',
    '.skill-list__items',
    '.about__timeline-item',
    '.footer a',
  ].join(',');

  window.__startSnake = function startSnake(opts = {}) {
    if (window.__snakeActive) return;
    window.__snakeActive = true;

    const strings = opts.strings || {};
    const txt = (key, fallback) => strings[key] || fallback;
    const trigger = opts.trigger || document.getElementById('egg-snake');

    function escapeHtml(str) {
      const span = document.createElement('span');
      span.textContent = String(str ?? '');
      return span.innerHTML;
    }

    function formatScore(value) {
      return String(value).padStart(4, '0');
    }

    function formatLevel(value) {
      return String(value).padStart(2, '0');
    }

    function levelFromBugs(bugsEaten) {
      return 1 + Math.floor(bugsEaten / BUGS_PER_LEVEL);
    }

    function speedForLevel(lvl) {
      return Math.max(MIN_SPEED, Math.round(START_SPEED * LEVEL_SPEED_FACTOR ** (lvl - 1)));
    }

    function playbackRateForLevel(lvl) {
      return Math.min(MAX_PLAYBACK_RATE, LEVEL_AUDIO_RATE ** (lvl - 1));
    }

    document.querySelectorAll('.card').forEach((c) => c.classList.add('is-visible'));

    const doc = document.documentElement;
    const footer = document.querySelector('.footer');
    const playBottom = footer ? footer.offsetTop + footer.offsetHeight : doc.scrollHeight;
    const cols = Math.floor(doc.clientWidth / CELL);
    const rows = Math.floor(playBottom / CELL);

    // Hindernisse als präzise Rechtecke (kein volles Raster) — Kollision nur bei
    // echtem Überlappen des Schlangen-Körpers mit sichtbarem Inhalt.
    const obstacleRects = [];

    function pushRect(left, top, right, bottom) {
      if (right - left < 3 || bottom - top < 3) return;
      obstacleRects.push({ left, top, right, bottom });
    }

    function markBoxRect(rect, insetX, insetTop, insetBottom) {
      if (rect.width < 2 || rect.height < 2) return;
      const left = rect.left + window.scrollX + insetX;
      const top = rect.top + window.scrollY + insetTop;
      const right = rect.left + window.scrollX + rect.width - insetX;
      const bottom = rect.top + window.scrollY + rect.height - insetBottom;
      pushRect(left, top, right, bottom);
    }

    function markTextRect(rect) {
      // Line-Boxes sind oft höher als die sichtbaren Glyphen — oben stark einziehen.
      const insetTop = Math.max(3, rect.height * 0.36);
      const insetBottom = Math.max(2, rect.height * 0.1);
      const insetX = Math.max(1, rect.width * 0.03);
      markBoxRect(rect, insetX, insetTop, insetBottom);
    }

    function markLineRect(rect) {
      const insetX = Math.max(1, rect.width * 0.02);
      const insetY = Math.max(1, rect.height * 0.2);
      markBoxRect(rect, insetX, insetY, insetY);
    }

    function markImageRect(rect) {
      markBoxRect(rect, 2, 2, 2);
    }

    function addTextObstacles(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const style = getComputedStyle(parent);
          if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      while (walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        for (const rect of range.getClientRects()) markTextRect(rect);
      }
    }

    function addSvgObstacles(root) {
      root.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse').forEach((svgEl) => {
        const stroke = parseFloat(getComputedStyle(svgEl).strokeWidth) || 1.5;
        const pad = Math.max(0.5, stroke * 0.35);
        for (const rect of svgEl.getClientRects()) markLineRect({
          left: rect.left + pad,
          top: rect.top + pad,
          width: rect.width - pad * 2,
          height: rect.height - pad * 2,
        });
      });
    }

    function addImageObstacles(root) {
      const imgs = root.tagName === 'IMG' ? [root] : [...root.querySelectorAll('img')];
      imgs.forEach((img) => {
        const rect = img.getBoundingClientRect();
        if (rect.width >= 8 && rect.height >= 8) markImageRect(rect);
      });
    }

    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
    }

    document.querySelectorAll(CONTENT_SELECTOR).forEach((el) => {
      if (!isVisible(el)) return;
      addTextObstacles(el);
      addSvgObstacles(el);
      addImageObstacles(el);
    });

    const rootStyles = getComputedStyle(doc);
    const colBody = rootStyles.getPropertyValue('--accent-ui').trim() || '#d4c4a8';
    const colHead = rootStyles.getPropertyValue('--accent-text').trim() || colBody;
    const colEye = rootStyles.getPropertyValue('--bg').trim() || '#0f1114';
    const COL_DEAD = '#f45b69';

    const canvas = document.createElement('canvas');
    canvas.className = 'snake-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    function sizeCanvas() {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    }

    const hud = document.createElement('div');
    hud.className = 'snake-hud';
    hud.innerHTML = `
      <div class="snake-hud__stats">
        <div class="snake-hud__stat">
          <span class="snake-hud__label">${escapeHtml(txt('levelShort', 'LV'))}</span>
          <span class="snake-hud__value" data-snake-level>01</span>
        </div>
        <div class="snake-hud__stat">
          <span class="snake-hud__label">${escapeHtml(txt('scoreShort', 'PTS'))}</span>
          <span class="snake-hud__value" data-snake-score>0000</span>
        </div>
      </div>
      <span class="snake-hud__hint" data-snake-hint></span>
      <button type="button" class="snake-hud__close" data-snake-quit aria-label="${escapeHtml(txt('close', 'Schließen'))}">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.25" stroke-linecap="square"/></svg>
      </button>`;
    const scoreEl = hud.querySelector('[data-snake-score]');
    const levelEl = hud.querySelector('[data-snake-level]');
    const hintEl = hud.querySelector('[data-snake-hint]');
    const quitBtn = hud.querySelector('[data-snake-quit]');
    hintEl.textContent = txt('hint', 'Pfeiltasten: steuern · Esc: beenden');
    quitBtn.addEventListener('click', () => cleanup());
    hud.setAttribute('role', 'status');

    // Audio
    const audioV = window.__ASSET_V ? `?v=${window.__ASSET_V}` : '';
    const bgm = new Audio(`${AUDIO_BASE}/bgm.mp3${audioV}`);
    bgm.loop = true;
    bgm.volume = 0.35;
    const sfxEat = new Audio(`${AUDIO_BASE}/eat.mp3${audioV}`);
    sfxEat.volume = 0.55;
    const sfxCrash = new Audio(`${AUDIO_BASE}/crash.mp3${audioV}`);
    sfxCrash.volume = 0.6;

    function playSfx(sfx) {
      try {
        sfx.currentTime = 0;
        sfx.play().catch(() => {});
      } catch {
        /* Autoplay blockiert */
      }
    }

    function startBgm() {
      try {
        bgm.play().catch(() => {});
      } catch {
        /* Autoplay blockiert */
      }
    }

    function scheduleTick() {
      tickTimer = window.setTimeout(tick, speed);
    }

    function stopAudio() {
      bgm.pause();
      bgm.currentTime = 0;
      bgm.playbackRate = 1;
    }

    let snake = [];
    let dir = { x: 0, y: -1 };
    let pendingDir = null;
    let grow = 0;
    let score = 0;
    let level = 1;
    let bugsEaten = 0;
    let speed = START_SPEED;
    let bugs = [];
    let started = true;
    let dead = false;
    let running = true;
    let tickTimer = null;
    let rafId = null;
    let overlay = null;
    let ticks = 0;
    let introUntil = 0;
    let movementEnabled = false;

    function cellHitsObstacle(c, r) {
      const cx = c * CELL + CELL / 2;
      const cy = r * CELL + CELL / 2;
      for (const o of obstacleRects) {
        if (
          cx + HIT_RADIUS > o.left &&
          cx - HIT_RADIUS < o.right &&
          cy + HIT_RADIUS > o.top &&
          cy - HIT_RADIUS < o.bottom
        ) {
          return true;
        }
      }
      return false;
    }

    window.__snakeDebug = () => ({
      score,
      level,
      bugsEaten,
      dead,
      started,
      running,
      ticks,
      len: snake.length,
      head: snake[0],
      bugs: bugs.map((b) => ({ c: b.c, r: b.r })),
      obstacles: obstacleRects.length,
    });

    const freeCell = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && !cellHitsObstacle(c, r);
    const onSnake = (c, r) => snake.some((seg) => seg.c === c && seg.r === r);
    const bugIndexAt = (c, r) => bugs.findIndex((b) => b.c === c && b.r === r);

    function placeSnake() {
      const viewBottom = Math.floor((window.scrollY + window.innerHeight * 0.88) / CELL);
      const headR = Math.min(rows - START_LEN - 2, Math.max(START_LEN + 2, viewBottom));
      const center = Math.floor(cols / 2);
      const columns = [0, -1, 1, -2, 2, -3, 3].map((d) => center + d).filter((c) => c >= 3 && c < cols - 3);

      for (const c of columns) {
        let fits = true;
        for (let i = 0; i < START_LEN; i++) {
          if (!freeCell(c, headR + i)) {
            fits = false;
            break;
          }
        }
        if (!fits) continue;

        let clearAbove = 0;
        for (let rr = headR - 1; rr >= Math.max(0, headR - 14); rr--) {
          if (!freeCell(c, rr)) break;
          clearAbove += 1;
        }
        if (clearAbove < 8) continue;

        snake = [];
        for (let i = 0; i < START_LEN; i++) snake.push({ c, r: headR + i });
        return true;
      }
      return false;
    }

    function spawnBug() {
      for (let i = 0; i < 300; i++) {
        const c = 1 + Math.floor(Math.random() * (cols - 2));
        const r = 2 + Math.floor(Math.random() * Math.max(1, rows - 4));
        if (freeCell(c, r) && !onSnake(c, r) && bugIndexAt(c, r) < 0) {
          bugs.push({ c, r });
          return;
        }
      }
    }

    const DIRS = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };

    function onKey(e) {
      if (overlay) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
        return;
      }
      const d = DIRS[e.key];
      if (!d) return;
      e.preventDefault();
      const current = pendingDir || dir;
      if (d.x === -current.x && d.y === -current.y) return;
      pendingDir = d;
    }

    function applyLevel(lvl, flash = false) {
      level = lvl;
      speed = speedForLevel(level);
      bgm.playbackRate = playbackRateForLevel(level);
      levelEl.textContent = formatLevel(level);
      if (movementEnabled && running && !dead) {
        window.clearTimeout(tickTimer);
        scheduleTick();
      }
      if (flash) {
        hud.classList.add('is-level-up');
        window.setTimeout(() => hud.classList.remove('is-level-up'), 520);
      }
    }

    function updateScoreDisplay() {
      scoreEl.textContent = formatScore(score);
    }

    function scheduleTick() {
      tickTimer = window.setTimeout(tick, speed);
    }

    function tick() {
      if (!running || dead || !movementEnabled) return;
      if (pendingDir) {
        dir = pendingDir;
        pendingDir = null;
      }
      const head = snake[0];
      const nc = head.c + dir.x;
      const nr = head.r + dir.y;
      const tailFrees = grow === 0;
      const hitsSelf = snake.some(
        (seg, i) => !(tailFrees && i === snake.length - 1) && seg.c === nc && seg.r === nr,
      );
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || cellHitsObstacle(nc, nr) || hitsSelf) {
        crash();
        return;
      }
      snake.unshift({ c: nc, r: nr });
      ticks += 1;
      const bugIdx = bugIndexAt(nc, nr);
      if (bugIdx >= 0) {
        bugs.splice(bugIdx, 1);
        bugsEaten += 1;
        score += 10;
        grow += 2;
        const newLevel = levelFromBugs(bugsEaten);
        if (newLevel > level) applyLevel(newLevel, true);
        updateScoreDisplay();
        playSfx(sfxEat);
        spawnBug();
      }
      if (grow > 0) grow -= 1;
      else snake.pop();

      const headPxY = nr * CELL;
      const target = Math.max(
        0,
        Math.min(headPxY - window.innerHeight * 0.45, doc.scrollHeight - window.innerHeight),
      );
      window.scrollTo(0, target);
      scheduleTick();
    }

    function crash() {
      dead = true;
      running = false;
      window.clearTimeout(tickTimer);
      stopAudio();
      playSfx(sfxCrash);
      window.setTimeout(showGameOver, 420);
    }

    function roundRectPath(x, y, w, h, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }

    function drawBug(cx, cy, t) {
      const wobble = Math.sin(t * 0.12 + cx) * 0.8;
      ctx.save();
      ctx.translate(cx, cy + wobble);
      ctx.font = `${CELL - 3}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🐛', 0, 1);
      ctx.restore();
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, -window.scrollX * dpr, -window.scrollY * dpr);
      ctx.clearRect(window.scrollX, window.scrollY, window.innerWidth, window.innerHeight);

      const inIntro = performance.now() < introUntil;
      const blinkOn = inIntro && Math.floor(performance.now() / 110) % 2 === 0;

      bugs.forEach((b) => drawBug(b.c * CELL + CELL / 2, b.r * CELL + CELL / 2, ticks));

      if (inIntro && snake.length && blinkOn) {
        const head = snake[0];
        const hx = head.c * CELL + CELL / 2;
        const hy = head.r * CELL + CELL / 2;
        ctx.save();
        ctx.strokeStyle = colHead;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(hx, hy, CELL * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = colHead;
        ctx.beginPath();
        ctx.arc(hx, hy, CELL * 0.95, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      snake.forEach((seg, i) => {
        const isHead = i === 0;
        const pad = isHead ? 1 : 2;
        const alpha = inIntro && blinkOn ? (isHead ? 1 : 0.45) : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = isHead ? (dead ? COL_DEAD : colHead) : colBody;
        roundRectPath(seg.c * CELL + pad, seg.r * CELL + pad, CELL - 2 * pad, CELL - 2 * pad, 6);
        ctx.fill();
        ctx.restore();
      });

      if (snake.length) {
        const head = snake[0];
        const d = dir;
        const cx = head.c * CELL + CELL / 2;
        const cy = head.r * CELL + CELL / 2;
        const side = { x: -d.y, y: d.x };
        ctx.fillStyle = dead ? '#fff' : colEye;
        const eyeAlpha = inIntro && blinkOn ? 1 : 1;
        ctx.globalAlpha = eyeAlpha;
        [1, -1].forEach((sign) => {
          ctx.beginPath();
          ctx.arc(cx + d.x * 3.5 + side.x * 3.5 * sign, cy + d.y * 3.5 + side.y * 3.5 * sign, 1.8, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
    }

    function loop() {
      draw();
      rafId = window.requestAnimationFrame(loop);
    }

    function loadBest() {
      try {
        const n = Number(localStorage.getItem(BEST_KEY));
        return Number.isFinite(n) && n >= 0 ? n : 0;
      } catch {
        return 0;
      }
    }

    function saveBest(value) {
      try {
        localStorage.setItem(BEST_KEY, String(value));
      } catch {
        /* private mode */
      }
    }

    function showGameOver() {
      const previousBest = loadBest();
      const isNewBest = score > previousBest;
      const best = Math.max(previousBest, score);
      if (isNewBest) saveBest(best);

      overlay = document.createElement('div');
      overlay.className = 'snake-overlay';
      overlay.innerHTML = `
        <div class="snake-dialog" role="dialog" aria-modal="true" aria-labelledby="snake-go-title">
          <p class="snake-dialog__pixel-title" id="snake-go-title">${escapeHtml(txt('gameOver', 'GAME OVER'))}</p>
          <div class="snake-scoreboard" aria-label="${escapeHtml(txt('scoreboardAria', 'Punktestand'))}">
            <div class="snake-scoreboard__card${isNewBest ? ' is-highlight' : ''}">
              <span class="snake-scoreboard__label">${escapeHtml(txt('scoreShort', 'PTS'))}</span>
              <span class="snake-scoreboard__value">${formatScore(score)}</span>
            </div>
            <div class="snake-scoreboard__card">
              <span class="snake-scoreboard__label">${escapeHtml(txt('levelShort', 'LV'))}</span>
              <span class="snake-scoreboard__value snake-scoreboard__value--level">${formatLevel(level)}</span>
            </div>
            <div class="snake-scoreboard__card snake-scoreboard__card--record">
              <span class="snake-scoreboard__label">${escapeHtml(txt('bestScore', 'HI'))}</span>
              <span class="snake-scoreboard__value snake-scoreboard__value--best">${formatScore(best)}</span>
              ${isNewBest ? `<span class="snake-scoreboard__badge">${escapeHtml(txt('newBest', 'NEW!'))}</span>` : ''}
            </div>
          </div>
          <div class="snake-dialog__actions">
            <button type="button" class="snake-btn snake-btn--primary" data-snake-again>${escapeHtml(txt('playAgain', 'NOCHMAL'))}</button>
            <button type="button" class="snake-btn snake-btn--ghost" data-snake-close>${escapeHtml(txt('close', 'ENDE'))}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      overlay.querySelector('[data-snake-again]').addEventListener('click', () => {
        const restartOpts = opts;
        cleanup();
        window.setTimeout(() => window.__startSnake(restartOpts), 30);
      });
      overlay.querySelector('[data-snake-close]').addEventListener('click', cleanup);
      overlay.querySelector('[data-snake-again]').focus();

      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup();
        }
      });
    }

    function onResize() {
      sizeCanvas();
    }

    function cleanup() {
      running = false;
      stopAudio();
      window.clearTimeout(tickTimer);
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      canvas.remove();
      hud.remove();
      overlay?.remove();
      overlay = null;
      doc.style.scrollBehavior = prevScrollBehavior;
      window.__snakeActive = false;
      trigger?.focus?.({ preventScroll: true });
    }

    const prevScrollBehavior = doc.style.scrollBehavior;
    doc.style.scrollBehavior = 'auto';
    sizeCanvas();
    if (!placeSnake()) {
      window.__snakeActive = false;
      return;
    }
    for (let i = 0; i < BUG_COUNT; i++) spawnBug();
    document.body.append(canvas, hud);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);

    const startPxY = snake[0].r * CELL;
    window.scrollTo(
      0,
      Math.max(0, Math.min(startPxY - window.innerHeight * 0.78, doc.scrollHeight - window.innerHeight)),
    );

    introUntil = performance.now() + INTRO_BLINK_MS;
    startBgm();
    loop();
    window.setTimeout(() => {
      movementEnabled = true;
      scheduleTick();
    }, INTRO_DELAY_MS);
  };
})();
