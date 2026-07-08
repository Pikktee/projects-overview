/* Snake-Easter-Egg: wird von app.js erst bei Klick auf „Video- & Brettspiele"
   nachgeladen. Die ganze Seite ist das Spielfeld — sichtbare Inhalts-Elemente
   sind Hindernisse, überall warten Enten. Das Spiel zeichnet auf ein
   viewport-großes fixed Canvas und rechnet in Dokument-Koordinaten; die Seite
   scrollt dem Schlangenkopf automatisch hinterher. Highscores landen im
   localStorage. */
(() => {
  const CELL = 20;
  const START_LEN = 4;
  const DUCK_COUNT = 12;
  const SCORE_KEY = 'portfolio-snake-scores';
  const NAME_KEY = 'portfolio-snake-name';
  const SOLID_SELECTOR = [
    '.hero__eyebrow',
    '.theme-toggle',
    '.lang-switch',
    '.hero__name',
    '.hero__me',
    '.hero__role',
    '.hero__bio',
    '.hero__contact-list li',
    '.facet-chip',
    '.filter-status',
    '.section__heading',
    '.card',
    '.about__photo',
    '.about__intro',
    '.about__label',
    '.about__interests li',
    '.skill-list__row',
    '.about__timeline-item',
    '.footer a',
  ].join(',');

  window.__startSnake = function startSnake(opts = {}) {
    if (window.__snakeActive) return;
    window.__snakeActive = true;

    const strings = opts.strings || {};
    const txt = (key, fallback) => strings[key] || fallback;
    const trigger = opts.trigger || document.getElementById('egg-snake');

    // Scroll-Reveal überspringen: die Schlange darf nicht durch (noch)
    // unsichtbare Karten fahren.
    document.querySelectorAll('.card').forEach((c) => c.classList.add('is-visible'));

    const doc = document.documentElement;
    const footer = document.querySelector('.footer');
    const playBottom = footer ? footer.offsetTop + footer.offsetHeight : doc.scrollHeight;
    const cols = Math.floor(doc.clientWidth / CELL);
    const rows = Math.floor(playBottom / CELL);
    const cellKey = (c, r) => r * cols + c;

    // Hindernis-Zellen aus den Bounding-Boxen der Inhalts-Elemente.
    const occupied = new Set();
    document.querySelectorAll(SOLID_SELECTOR).forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const x = rect.left + window.scrollX + 2;
      const y = rect.top + window.scrollY + 2;
      const c0 = Math.max(0, Math.floor(x / CELL));
      const r0 = Math.max(0, Math.floor(y / CELL));
      const c1 = Math.min(cols - 1, Math.floor((x + rect.width - 4) / CELL));
      const r1 = Math.min(rows - 1, Math.floor((y + rect.height - 4) / CELL));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) occupied.add(cellKey(c, r));
      }
    });

    // Theme-Farben einmalig lesen (Schlange trägt den Seiten-Akzent).
    const rootStyles = getComputedStyle(doc);
    const colBody = rootStyles.getPropertyValue('--accent-ui').trim() || '#d4c4a8';
    const colHead = rootStyles.getPropertyValue('--accent-text').trim() || colBody;
    const colEye = rootStyles.getPropertyValue('--bg').trim() || '#0f1114';
    const COL_DEAD = '#f45b69';

    // Canvas (viewport-groß, fixed) + HUD
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
    hud.innerHTML = `<span class="snake-hud__score">🦆 <span data-snake-score>0</span></span><span class="snake-hud__hint" data-snake-hint></span><button type="button" class="snake-hud__close" data-snake-quit><svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></button>`;
    const scoreEl = hud.querySelector('[data-snake-score]');
    const hintEl = hud.querySelector('[data-snake-hint]');
    const quitBtn = hud.querySelector('[data-snake-quit]');
    hintEl.textContent = txt('start', 'Drück eine Pfeiltaste!');
    quitBtn.setAttribute('aria-label', txt('close', 'Schließen'));
    quitBtn.addEventListener('click', () => cleanup());
    hud.setAttribute('role', 'status');

    // Spielzustand
    let snake = [];
    let dir = null;
    let pendingDir = null;
    let grow = 0;
    let score = 0;
    let speed = 120;
    let ducks = [];
    let started = false;
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
      ducks: ducks.map((d) => ({ c: d.c, r: d.r })),
    });

    const freeCell = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && !occupied.has(cellKey(c, r));
    const onSnake = (c, r) => snake.some((seg) => seg.c === c && seg.r === r);
    const duckIndexAt = (c, r) => ducks.findIndex((d) => d.c === c && d.r === r);

    // Startposition: das freieste Fenster der ganzen Seite (Score über ein
    // 10×5-Umfeld), bei Gleichstand möglichst nah am aktuellen Viewport.
    // Die Seite scrollt danach automatisch zum Kopf — so beginnt das Spiel
    // nie eingeklemmt zwischen Textzeilen.
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
          const score = free * 1000 - Math.abs(r - viewCenter);
          if (!best || score > best.score) best = { c, r, score };
        }
      }
      if (!best) return false;
      snake = [];
      for (let i = 0; i < START_LEN; i++) snake.push({ c: best.c - i, r: best.r });
      return true;
    }

    function spawnDuck() {
      for (let i = 0; i < 300; i++) {
        const c = 1 + Math.floor(Math.random() * (cols - 2));
        const r = 2 + Math.floor(Math.random() * Math.max(1, rows - 4));
        if (freeCell(c, r) && !onSnake(c, r) && duckIndexAt(c, r) < 0) {
          ducks.push({ c, r });
          return;
        }
      }
    }

    // Steuerung
    const DIRS = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };

    function onKey(e) {
      if (overlay) return; // Dialog hat eigene Tastatur-Logik
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
        return;
      }
      const d = DIRS[e.key];
      if (!d) return;
      e.preventDefault();
      const current = pendingDir || dir || { x: 1, y: 0 };
      if (d.x === -current.x && d.y === -current.y) return; // keine 180°-Wende
      pendingDir = d;
      if (!started) {
        started = true;
        hintEl.textContent = txt('hint', 'Pfeiltasten: steuern · Esc: beenden');
        scheduleTick();
      }
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
      if (!dir) {
        scheduleTick();
        return;
      }
      const head = snake[0];
      const nc = head.c + dir.x;
      const nr = head.r + dir.y;
      const tailFrees = grow === 0; // Schwanzzelle wird im selben Tick frei
      const hitsSelf = snake.some(
        (seg, i) => !(tailFrees && i === snake.length - 1) && seg.c === nc && seg.r === nr,
      );
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || occupied.has(cellKey(nc, nr)) || hitsSelf) {
        crash();
        return;
      }
      snake.unshift({ c: nc, r: nr });
      ticks += 1;
      const duckIdx = duckIndexAt(nc, nr);
      if (duckIdx >= 0) {
        ducks.splice(duckIdx, 1);
        score += 10;
        grow += 2;
        speed = Math.max(70, speed - 2);
        scoreEl.textContent = String(score);
        spawnDuck();
      }
      if (grow > 0) grow -= 1;
      else snake.pop();

      // Auto-Scroll: der Kopf bleibt im mittleren Drittel des Viewports.
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
      window.setTimeout(showGameOver, 420);
    }

    // Zeichnen (rAF-Loop, in Dokument-Koordinaten dank Transform)
    function roundRectPath(x, y, w, h, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, -window.scrollX * dpr, -window.scrollY * dpr);
      ctx.clearRect(window.scrollX, window.scrollY, window.innerWidth, window.innerHeight);

      ctx.font = `${CELL - 2}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ducks.forEach((d) => {
        ctx.fillText('🦆', d.c * CELL + CELL / 2, d.r * CELL + CELL / 2 + 1);
      });

      snake.forEach((seg, i) => {
        const isHead = i === 0;
        const pad = isHead ? 1 : 2;
        ctx.fillStyle = isHead ? (dead ? COL_DEAD : colHead) : colBody;
        roundRectPath(seg.c * CELL + pad, seg.r * CELL + pad, CELL - 2 * pad, CELL - 2 * pad, 6);
        ctx.fill();
      });

      if (snake.length) {
        const head = snake[0];
        const d = dir || { x: 1, y: 0 };
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

    // Highscores
    function loadScores() {
      try {
        const list = JSON.parse(localStorage.getItem(SCORE_KEY) || '[]');
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    }

    function saveScores(list) {
      try {
        localStorage.setItem(SCORE_KEY, JSON.stringify(list));
      } catch {
        /* private mode */
      }
    }

    function renderScores(listEl, emptyEl, youIndex) {
      const scores = loadScores();
      listEl.innerHTML = scores
        .map(
          (entry, i) =>
            `<li${i === youIndex ? ' class="is-you"' : ''}><span>${i + 1}. ${escapeHtml(entry.n)}</span><span>${entry.s}</span></li>`,
        )
        .join('');
      emptyEl.hidden = scores.length > 0;
      listEl.hidden = scores.length === 0;
    }

    function escapeHtml(str) {
      const span = document.createElement('span');
      span.textContent = String(str ?? '');
      return span.innerHTML;
    }

    function showGameOver() {
      overlay = document.createElement('div');
      overlay.className = 'snake-overlay';
      overlay.innerHTML = `
        <div class="snake-dialog" role="dialog" aria-modal="true" aria-labelledby="snake-go-title">
          <h2 class="snake-dialog__title" id="snake-go-title">${escapeHtml(txt('gameOver', 'Game Over!'))}</h2>
          <p class="snake-dialog__score">${escapeHtml(txt('yourScore', 'Deine Punkte'))}: <strong>${score}</strong></p>
          <h3 class="snake-dialog__subtitle">${escapeHtml(txt('highscores', 'Bestenliste'))}</h3>
          <p class="snake-scores__empty" data-snake-empty hidden>${escapeHtml(txt('empty', 'Noch keine Einträge.'))}</p>
          <ol class="snake-scores" data-snake-list></ol>
          <form class="snake-form" data-snake-form>
            <input type="text" maxlength="24" placeholder="${escapeHtml(txt('namePlaceholder', 'Dein Name'))}" aria-label="${escapeHtml(txt('nameLabel', 'Name für die Bestenliste'))}" data-snake-name />
            <button type="submit" class="btn btn--primary">${escapeHtml(txt('save', 'Eintragen'))}</button>
          </form>
          <div class="snake-dialog__actions">
            <button type="button" class="btn btn--ghost" data-snake-again>${escapeHtml(txt('playAgain', 'Nochmal spielen'))}</button>
            <button type="button" class="btn btn--ghost" data-snake-close>${escapeHtml(txt('close', 'Schließen'))}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const listEl = overlay.querySelector('[data-snake-list]');
      const emptyEl = overlay.querySelector('[data-snake-empty]');
      const form = overlay.querySelector('[data-snake-form]');
      const nameInput = overlay.querySelector('[data-snake-name]');
      renderScores(listEl, emptyEl, -1);

      try {
        nameInput.value = localStorage.getItem(NAME_KEY) || '';
      } catch {
        /* private mode */
      }
      nameInput.focus();

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = nameInput.value.trim().slice(0, 24) || '???';
        try {
          localStorage.setItem(NAME_KEY, name);
        } catch {
          /* private mode */
        }
        const scores = loadScores();
        scores.push({ n: name, s: score, d: Date.now() });
        scores.sort((a, b) => b.s - a.s || a.d - b.d);
        const trimmed = scores.slice(0, 10);
        saveScores(trimmed);
        const youIndex = trimmed.findIndex((entry) => entry.n === name && entry.s === score);
        renderScores(listEl, emptyEl, youIndex);
        form.hidden = true;
        overlay.querySelector('[data-snake-again]').focus();
      });

      overlay.querySelector('[data-snake-again]').addEventListener('click', () => {
        const restartOpts = opts;
        cleanup();
        window.setTimeout(() => window.__startSnake(restartOpts), 30);
      });
      overlay.querySelector('[data-snake-close]').addEventListener('click', cleanup);

      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup();
          return;
        }
        if (e.key !== 'Tab') return;
        const focusables = overlay.querySelectorAll('button:not([hidden]), input:not([hidden])');
        const items = [...focusables].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
    }

    function onResize() {
      sizeCanvas();
    }

    function cleanup() {
      running = false;
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

    // Boot
    const prevScrollBehavior = doc.style.scrollBehavior;
    doc.style.scrollBehavior = 'auto';
    sizeCanvas();
    if (!placeSnake()) {
      // Kein Platz gefunden (sollte nie passieren) — sauber abbrechen.
      window.__snakeActive = false;
      return;
    }
    for (let i = 0; i < DUCK_COUNT; i++) spawnDuck();
    document.body.append(canvas, hud);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    // Direkt zum Startpunkt scrollen, damit die Schlange sichtbar ist.
    const startPxY = snake[0].r * CELL;
    window.scrollTo(
      0,
      Math.max(0, Math.min(startPxY - window.innerHeight * 0.45, doc.scrollHeight - window.innerHeight)),
    );
    loop();
  };
})();
