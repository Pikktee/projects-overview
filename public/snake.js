/* Snake-Easter-Egg: wird von app.js erst bei Klick auf „Video- & Brettspiele"
   nachgeladen. Die ganze Seite ist das Spielfeld — sichtbare Inhalts-Elemente
   sind Hindernisse, überall warten Bugs. Das Spiel zeichnet auf ein
   viewport-großes fixed Canvas und rechnet in Dokument-Koordinaten; die Seite
   scrollt dem Schlangenkopf automatisch hinterher. Bestwert landet im
   localStorage. */
(() => {
  const CELL = 20;
  const START_LEN = 4;
  const BUG_COUNT = 20;
  const BEST_KEY = 'portfolio-snake-best';
  const AUDIO_BASE = '/snake-audio';
  const INTRO_BLINK_MS = 2600;
  const INTRO_DELAY_MS = 850;
  const START_SPEED = 170;
  const BUGS_PER_LEVEL = 5;
  const SPEED_DROP_PER_LEVEL = 6;
  const AUDIO_BUMP_PER_LEVEL = 0.07;
  const MIN_SPEED = 88;
  const MAX_PLAYBACK_RATE = 1.85;
  const CARD_BORDER_HIT = 5;

  // Nur Inhalts-Elemente — keine großen Container wie .card (Padding wäre sonst Hindernis).
  const CONTENT_SELECTOR = [
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
    '.section__heading',
    '.card__title',
    '.card__desc',
    '.card__tags',
    '.card__media img',
    '.card__placeholder span',
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
  const CONTENT_SELECTORS = CONTENT_SELECTOR.split(',').map((s) => s.trim());
  const IGNORE_LAYERS = '.snake-canvas,.snake-hud,.snake-overlay,.aurora,.grain,.skip-link';
  const LAYOUT_CHROME =
    'html,body,main,.work,.work__catalog,.facet-bar,.grid,.sections,.section,.about,.about__grid,.about__col,.about__personal,.about__personal-body,.about__photo-swing,.about__photo-card,.hero,.hero__bar,.hero__title-row,.hero__controls,.hero__contact,.hero__contact-list,.skill-list,.about__timeline,.card,.card__btn,.card__body,.card__media,.card__placeholder';

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
      return Math.max(MIN_SPEED, START_SPEED - (lvl - 1) * SPEED_DROP_PER_LEVEL);
    }

    function playbackRateForLevel(lvl) {
      return Math.min(MAX_PLAYBACK_RATE, 1 + (lvl - 1) * AUDIO_BUMP_PER_LEVEL);
    }

    document.querySelectorAll('.card').forEach((c) => c.classList.add('is-visible'));

    const doc = document.documentElement;
    const footer = document.querySelector('.footer');
    const playBottom = footer ? footer.offsetTop + footer.offsetHeight : doc.scrollHeight;
    const cols = Math.floor(doc.clientWidth / CELL);
    const rows = Math.floor(playBottom / CELL);

    const cardZones = [...document.querySelectorAll('.card__btn')].map((btn) => {
      const rect = btn.getBoundingClientRect();
      return {
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY,
        right: rect.right + window.scrollX,
        bottom: rect.bottom + window.scrollY,
      };
    });

    function insideCardZone(docX, docY) {
      return cardZones.some(
        (z) => docX >= z.left && docX <= z.right && docY >= z.top && docY <= z.bottom,
      );
    }

    function hitsCardBoundary(docX, docY) {
      const b = CARD_BORDER_HIT;
      for (const z of cardZones) {
        if (docX < z.left || docX > z.right || docY < z.top || docY > z.bottom) continue;
        if (
          docX <= z.left + b ||
          docX >= z.right - b ||
          docY <= z.top + b ||
          docY >= z.bottom - b
        ) {
          return true;
        }
      }
      return false;
    }

    function pointInRect(vx, vy, rect, pad = 0) {
      return (
        vx >= rect.left + pad &&
        vx <= rect.right - pad &&
        vy >= rect.top + pad &&
        vy <= rect.bottom - pad
      );
    }

    function pointHitsInk(el, vx, vy) {
      if (!(el instanceof Element)) return false;

      if (el.tagName === 'IMG') {
        return pointInRect(vx, vy, el.getBoundingClientRect(), 2);
      }

      const svgLeaf = el.closest('path,line,polyline,polygon,rect,circle,ellipse');
      if (svgLeaf) {
        for (const rect of svgLeaf.getClientRects()) {
          if (pointInRect(vx, vy, rect, 0.5)) return true;
        }
        return false;
      }

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const style = getComputedStyle(parent);
          if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.05) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      while (walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        for (const rect of range.getClientRects()) {
          if (rect.width < 1 || rect.height < 1) continue;
          const insetX = Math.max(0.5, rect.width * 0.015);
          const insetY = Math.max(0.5, rect.height * 0.08);
          if (
            vx >= rect.left + insetX &&
            vx <= rect.right - insetX &&
            vy >= rect.top + insetY &&
            vy <= rect.bottom - insetY
          ) {
            return true;
          }
        }
      }
      return false;
    }

    function isObstacleAt(docX, docY) {
      const vx = docX - window.scrollX;
      const vy = docY - window.scrollY;
      if (vx < 0 || vy < 0 || vx >= window.innerWidth || vy >= window.innerHeight) return false;

      for (const el of document.elementsFromPoint(vx, vy)) {
        if (!(el instanceof Element)) continue;
        if (el.closest(IGNORE_LAYERS)) continue;
        if (el.matches(LAYOUT_CHROME)) continue;

        let contentEl = null;
        for (const sel of CONTENT_SELECTORS) {
          if (el.matches(sel)) {
            contentEl = el;
            break;
          }
          const closest = el.closest(sel);
          if (closest) {
            contentEl = closest;
            break;
          }
        }
        if (contentEl && pointHitsInk(contentEl, vx, vy)) return true;
      }
      return false;
    }

    const isLightTheme = doc.getAttribute('data-theme') === 'light';
    const colBody = isLightTheme ? '#3d9e6a' : '#6ecf9a';
    const colHead = isLightTheme ? '#2a7d52' : '#9ee4c0';
    const colStroke = isLightTheme ? '#1f5c3c' : '#3a9e6a';
    const colEye = isLightTheme ? '#f4f1e9' : '#0f1114';
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
    hud.className = `snake-hud${isLightTheme ? ' snake-hud--light' : ''}`;
    hud.innerHTML = `
      <div class="snake-hud__panel">
        <div class="snake-hud__crest" aria-hidden="true"><span class="snake-hud__bug">🐛</span></div>
        <div class="snake-hud__stats">
          <div class="snake-hud__stat snake-hud__stat--level">
            <span class="snake-hud__label">${escapeHtml(txt('levelShort', 'LV'))}</span>
            <span class="snake-hud__value" data-snake-level>01</span>
          </div>
          <div class="snake-hud__stat snake-hud__stat--pts">
            <span class="snake-hud__label">${escapeHtml(txt('scoreShort', 'PTS'))}</span>
            <span class="snake-hud__value" data-snake-score>0000</span>
          </div>
        </div>
        <button type="button" class="snake-hud__close" data-snake-quit aria-label="${escapeHtml(txt('close', 'Schließen'))}">
          <span aria-hidden="true">✕</span>
        </button>
      </div>`;
    const scoreEl = hud.querySelector('[data-snake-score]');
    const levelEl = hud.querySelector('[data-snake-level]');
    const quitBtn = hud.querySelector('[data-snake-quit]');
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
    const dirQueue = [];
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
      const x0 = c * CELL;
      const y0 = r * CELL;
      const samples = [
        [x0 + CELL / 2, y0 + CELL / 2],
        [x0 + 3, y0 + 3],
        [x0 + CELL - 3, y0 + 3],
        [x0 + 3, y0 + CELL - 3],
        [x0 + CELL - 3, y0 + CELL - 3],
      ];
      return samples.some(([x, y]) => hitsCardBoundary(x, y) || isObstacleAt(x, y));
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
      cardZones: cardZones.length,
    });

    function wrapCol(c) {
      if (c < 0) return cols - 1;
      if (c >= cols) return 0;
      return c;
    }

    const freeCell = (c, r) => {
      if (c < 0 || c >= cols || r < 0 || r >= rows) return false;
      const cx = c * CELL + CELL / 2;
      const cy = r * CELL + CELL / 2;
      if (insideCardZone(cx, cy)) return false;
      return !cellHitsObstacle(c, r);
    };
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
          return true;
        }
      }
      return false;
    }

    function fillBugs() {
      bugs = bugs.filter((b) => {
        const cx = b.c * CELL + CELL / 2;
        const cy = b.r * CELL + CELL / 2;
        return !insideCardZone(cx, cy);
      });
      let guard = 0;
      while (bugs.length < BUG_COUNT && guard < BUG_COUNT * 40) {
        spawnBug();
        guard += 1;
      }
    }

    const DIRS = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 },
      W: { x: 0, y: -1 },
      s: { x: 0, y: 1 },
      S: { x: 0, y: 1 },
      a: { x: -1, y: 0 },
      A: { x: -1, y: 0 },
      d: { x: 1, y: 0 },
      D: { x: 1, y: 0 },
    };

    function queueDir(d) {
      const ref = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
      if (d.x === -ref.x && d.y === -ref.y) return;
      if (dirQueue.length < 2) {
        dirQueue.push(d);
        return;
      }
      dirQueue[1] = d;
    }

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
      queueDir(d);
    }

    function applyLevel(lvl, flash = false) {
      level = lvl;
      speed = speedForLevel(level);
      bgm.playbackRate = playbackRateForLevel(level);
      levelEl.textContent = formatLevel(level);
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
      if (dirQueue.length) dir = dirQueue.shift();
      const head = snake[0];
      let nc = wrapCol(head.c + dir.x);
      const nr = head.r + dir.y;
      const tailFrees = grow === 0;
      const hitsSelf = snake.some(
        (seg, i) => !(tailFrees && i === snake.length - 1) && seg.c === nc && seg.r === nr,
      );
      if (nr < 0 || nr >= rows || cellHitsObstacle(nc, nr) || hitsSelf) {
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
        ctx.strokeStyle = colStroke;
        ctx.lineWidth = 1.25;
        ctx.stroke();
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
          <div class="snake-dialog__frame">
            <div class="snake-dialog__header" aria-hidden="true">
              <span>🐛</span><span>🐛</span><span>🐛</span>
            </div>
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
    fillBugs();
    document.body.append(canvas, hud);
    trigger?.blur?.();
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
