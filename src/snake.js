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

  // Nur Inhalts-Elemente — keine großen Container wie .card (Padding wäre sonst Hindernis).
  const CONTENT_SELECTOR = [
    '.hero__eyebrow',
    '.theme-toggle',
    '.lang-switch__btn',
    '.hero__name',
    '.hero__arrow-path',
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

    document.querySelectorAll('.card').forEach((c) => c.classList.add('is-visible'));

    const doc = document.documentElement;
    const footer = document.querySelector('.footer');
    const playBottom = footer ? footer.offsetTop + footer.offsetHeight : doc.scrollHeight;
    const cols = Math.floor(doc.clientWidth / CELL);
    const rows = Math.floor(playBottom / CELL);
    const cellKey = (c, r) => r * cols + c;

    // Hindernis-Zellen nur aus sichtbarem Inhalt (Text, Linien, Bilder) —
    // nicht aus leerem Container-Padding.
    const occupied = new Set();

    function markRect(rect, pad = 1) {
      if (rect.width < 2 || rect.height < 2) return;
      const x = rect.left + window.scrollX + pad;
      const y = rect.top + window.scrollY + pad;
      const w = rect.width - pad * 2;
      const h = rect.height - pad * 2;
      if (w < 2 || h < 2) return;
      const c0 = Math.max(0, Math.floor(x / CELL));
      const r0 = Math.max(0, Math.floor(y / CELL));
      const c1 = Math.min(cols - 1, Math.floor((x + w) / CELL));
      const r1 = Math.min(rows - 1, Math.floor((y + h) / CELL));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) occupied.add(cellKey(c, r));
      }
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
        for (const rect of range.getClientRects()) markRect(rect, 0);
      }
    }

    function addSvgObstacles(root) {
      root.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse').forEach((svgEl) => {
        const stroke = parseFloat(getComputedStyle(svgEl).strokeWidth) || 1.5;
        const pad = Math.max(1, stroke * 0.6);
        for (const rect of svgEl.getClientRects()) markRect(rect, pad);
      });
    }

    function addImageObstacles(root) {
      const imgs = root.tagName === 'IMG' ? [root] : [...root.querySelectorAll('img')];
      imgs.forEach((img) => {
        const rect = img.getBoundingClientRect();
        if (rect.width >= 8 && rect.height >= 8) markRect(rect, 1);
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
    hud.innerHTML = `<span class="snake-hud__score">🐛 <span data-snake-score>0</span></span><span class="snake-hud__hint" data-snake-hint></span><button type="button" class="snake-hud__close" data-snake-quit><svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></button>`;
    const scoreEl = hud.querySelector('[data-snake-score]');
    const hintEl = hud.querySelector('[data-snake-hint]');
    const quitBtn = hud.querySelector('[data-snake-quit]');
    hintEl.textContent = txt('hint', 'Pfeiltasten: steuern · Esc: beenden');
    quitBtn.setAttribute('aria-label', txt('close', 'Schließen'));
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

    function stopAudio() {
      bgm.pause();
      bgm.currentTime = 0;
    }

    let snake = [];
    let dir = { x: 1, y: 0 };
    let pendingDir = null;
    let grow = 0;
    let score = 0;
    let speed = 120;
    let bugs = [];
    let started = true;
    let dead = false;
    let running = true;
    let tickTimer = null;
    let rafId = null;
    let overlay = null;
    let ticks = 0;

    window.__snakeDebug = () => ({
      score,
      dead,
      started,
      running,
      ticks,
      len: snake.length,
      head: snake[0],
      bugs: bugs.map((b) => ({ c: b.c, r: b.r })),
      obstacles: occupied.size,
    });

    const freeCell = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && !occupied.has(cellKey(c, r));
    const onSnake = (c, r) => snake.some((seg) => seg.c === c && seg.r === r);
    const bugIndexAt = (c, r) => bugs.findIndex((b) => b.c === c && b.r === r);

    function placeSnake() {
      const viewCenter = Math.round((window.scrollY + window.innerHeight / 2) / CELL);
      let best = null;
      for (let r = 3; r < rows - 3; r += 2) {
        for (let c = START_LEN + 3; c < cols - 3; c++) {
          let ok = true;
          for (let i = 0; i < START_LEN; i++) {
            if (!freeCell(c - i, r)) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          let free = 0;
          for (let rr = r - 2; rr <= r + 2; rr++) {
            for (let cc = c - START_LEN - 2; cc <= c + 3; cc++) {
              if (freeCell(cc, rr)) free += 1;
            }
          }
          const fit = free * 1000 - Math.abs(r - viewCenter);
          if (!best || fit > best.score) best = { c, r, score: fit };
        }
      }
      if (!best) return false;
      snake = [];
      for (let i = 0; i < START_LEN; i++) snake.push({ c: best.c - i, r: best.r });
      return true;
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

    function scheduleTick() {
      tickTimer = window.setTimeout(tick, speed);
    }

    function tick() {
      if (!running || dead) return;
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
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || occupied.has(cellKey(nc, nr)) || hitsSelf) {
        crash();
        return;
      }
      snake.unshift({ c: nc, r: nr });
      ticks += 1;
      const bugIdx = bugIndexAt(nc, nr);
      if (bugIdx >= 0) {
        bugs.splice(bugIdx, 1);
        score += 10;
        grow += 2;
        speed = Math.max(70, speed - 2);
        scoreEl.textContent = String(score);
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

      bugs.forEach((b) => drawBug(b.c * CELL + CELL / 2, b.r * CELL + CELL / 2, ticks));

      snake.forEach((seg, i) => {
        const isHead = i === 0;
        const pad = isHead ? 1 : 2;
        ctx.fillStyle = isHead ? (dead ? COL_DEAD : colHead) : colBody;
        roundRectPath(seg.c * CELL + pad, seg.r * CELL + pad, CELL - 2 * pad, CELL - 2 * pad, 6);
        ctx.fill();
      });

      if (snake.length) {
        const head = snake[0];
        const d = dir;
        const cx = head.c * CELL + CELL / 2;
        const cy = head.r * CELL + CELL / 2;
        const side = { x: -d.y, y: d.x };
        ctx.fillStyle = dead ? '#fff' : colEye;
        [1, -1].forEach((sign) => {
          ctx.beginPath();
          ctx.arc(cx + d.x * 3.5 + side.x * 3.5 * sign, cy + d.y * 3.5 + side.y * 3.5 * sign, 1.8, 0, Math.PI * 2);
          ctx.fill();
        });
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

    function escapeHtml(str) {
      const span = document.createElement('span');
      span.textContent = String(str ?? '');
      return span.innerHTML;
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
          <h2 class="snake-dialog__title" id="snake-go-title">${escapeHtml(txt('gameOver', 'Game Over!'))}</h2>
          <div class="snake-scoreboard" aria-label="${escapeHtml(txt('scoreboardAria', 'Punktestand'))}">
            <div class="snake-scoreboard__card${isNewBest ? ' snake-scoreboard__card--best' : ''}">
              <span class="snake-scoreboard__label">${escapeHtml(txt('yourScore', 'Deine Punkte'))}</span>
              <span class="snake-scoreboard__value">${score}</span>
            </div>
            <div class="snake-scoreboard__divider" aria-hidden="true"></div>
            <div class="snake-scoreboard__card snake-scoreboard__card--record">
              <span class="snake-scoreboard__label">${escapeHtml(txt('bestScore', 'Rekord'))}</span>
              <span class="snake-scoreboard__value">${best}</span>
              ${isNewBest ? `<span class="snake-scoreboard__badge">${escapeHtml(txt('newBest', 'Neuer Rekord!'))}</span>` : ''}
            </div>
          </div>
          <div class="snake-dialog__actions">
            <button type="button" class="btn btn--primary" data-snake-again>${escapeHtml(txt('playAgain', 'Nochmal spielen'))}</button>
            <button type="button" class="btn btn--ghost" data-snake-close>${escapeHtml(txt('close', 'Schließen'))}</button>
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
      Math.max(0, Math.min(startPxY - window.innerHeight * 0.45, doc.scrollHeight - window.innerHeight)),
    );
    startBgm();
    scheduleTick();
    loop();
  };
})();
