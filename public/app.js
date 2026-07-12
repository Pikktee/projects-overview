(() => {
  // Signalisiert dem CSS, dass JS läuft — erst dann werden Karten für den
  // Scroll-Reveal initial versteckt (Fallback ohne JS: alles sichtbar).
  document.documentElement.classList.add('js');

  const LANG_KEY = 'portfolio-lang';
  const THEME_KEY = 'portfolio-theme';

  // ── Theme: data-theme wurde bereits vom Inline-Script im <head> gesetzt.
  // Hier nur noch Toggle, Persistenz und Folgen der Systempräferenz,
  // solange keine explizite Wahl gespeichert ist.
  const themeToggle = document.getElementById('theme-toggle');
  const themeMetas = document.querySelectorAll('meta[name="theme-color"]');
  const THEME_COLORS = { dark: '#0f1114', light: '#f4f1e9' };

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle?.setAttribute('aria-pressed', String(theme === 'dark'));
    themeMetas.forEach((meta) => meta.setAttribute('content', THEME_COLORS[theme]));
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* private mode */
      }
    }
  }

  applyTheme(currentTheme(), false);

  themeToggle?.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  });

  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  darkScheme.addEventListener?.('change', (e) => {
    let stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      /* private mode */
    }
    if (stored !== 'light' && stored !== 'dark') applyTheme(e.matches ? 'dark' : 'light', false);
  });

  let locale = 'de';
  let site = {};
  let strings = {};

  const drawer = document.getElementById('project-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const closeBtn = document.getElementById('drawer-close');
  const cards = document.querySelectorAll('.card');
  const facetChips = document.querySelectorAll('.facet-chip');
  const facetSheet = document.getElementById('facet-sheet');
  const facetOpen = document.getElementById('facet-open');
  const facetClose = document.getElementById('facet-sheet-close');
  const facetBackdrop = document.getElementById('facet-sheet-backdrop');
  const facetActiveChip = document.getElementById('facet-active-chip');
  const facetActiveChipIcon = document.getElementById('facet-active-chip-icon');
  const facetActiveChipLabel = document.getElementById('facet-active-chip-label');
  const facetActiveChipCount = document.getElementById('facet-active-chip-count');
  const openButtons = document.querySelectorAll('[data-open]');
  const tabs = document.querySelectorAll('.drawer__tab');
  const panels = {
    overview: document.getElementById('panel-overview'),
    ux: document.getElementById('panel-ux'),
    tech: document.getElementById('panel-tech'),
  };

  let projects = {};
  let activeSlug = null;
  let lastFocus = null;
  let activeTab = 'overview';
  let closeTimer = null;
  let drawerCloseFinished = false;
  let activeFilter = 'all';
  let facetSheetOpen = false;
  let lastFacetFocus = null;

  function t(key, vars = {}) {
    const parts = key.split('.');
    let value = strings;
    for (const part of parts) {
      value = value?.[part];
    }
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
  }

  function detectLocale() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('lang');
    if (fromUrl && site.locales?.includes(fromUrl)) return fromUrl;

    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored && site.locales?.includes(stored)) return stored;
    } catch {
      /* private mode */
    }

    const browser = (navigator.language || '').slice(0, 2).toLowerCase();
    if (site.locales?.includes(browser)) return browser;
    return site.defaultLocale || 'de';
  }

  function setLocale(next) {
    if (!site.locales?.includes(next) || next === locale) return;
    locale = next;
    strings = site.translations[locale] || {};
    try {
      localStorage.setItem(LANG_KEY, locale);
    } catch {
      /* private mode */
    }

    const url = new URL(location.href);
    if (next === site.defaultLocale) url.searchParams.delete('lang');
    else url.searchParams.set('lang', next);
    history.replaceState(null, '', url.pathname + url.search + url.hash);

    applyI18n();
    if (activeSlug && projects[activeSlug]) renderDrawer(projects[activeSlug]);
    if (activeFilter !== 'all') setFilter(activeFilter);
  }

  function applyI18n() {
    document.documentElement.lang = locale;
    document.title = document.body.classList.contains('page-legal')
      ? t('legal.pageTitle')
      : t('meta.title');
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', t('meta.description'));

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });

    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });

    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });

    document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
      el.setAttribute('alt', t(el.dataset.i18nAlt));
    });

    document.querySelectorAll('[data-i18n-facet]').forEach((el) => {
      const label = el.querySelector('.facet-chip__label');
      if (label) label.textContent = t(`facets.${el.dataset.i18nFacet}`);
    });

    document.querySelectorAll('[data-i18n-section]').forEach((el) => {
      el.textContent = t(`sections.${el.dataset.i18nSection}`);
    });

    document.querySelectorAll('.card__cta-label[data-i18n-template]').forEach((el) => {
      const name = el.dataset.name || el.closest('.card')?.querySelector('.card__title')?.textContent || '';
      el.textContent = t(el.dataset.i18nTemplate, { name });
    });

    document.querySelectorAll('.card__desc[data-slug]').forEach((el) => {
      const slug = el.dataset.slug;
      const p = projects[slug];
      const enSummary =
        p?.copy?.en?.summary || p?.copy?.en?.tagline || site.projectSummaries?.en?.[slug];
      el.textContent =
        locale === 'en' && enSummary ? enSummary : el.dataset.defaultDesc || el.textContent;
    });

    document.querySelectorAll('[data-open]').forEach((btn) => {
      const slug = btn.dataset.open;
      const p = projects[slug];
      if (!p) return;
      const desc =
        locale === 'en'
          ? p.copy?.en?.summary || p.copy?.en?.tagline || btn.dataset.enAria?.split(': ').slice(1).join(': ')
          : p.copy?.de?.summary || p.copy?.de?.tagline || btn.dataset.defaultAria?.split(': ').slice(1).join(': ');
      if (desc) btn.setAttribute('aria-label', `${p.name}: ${desc}`);
      else if (locale === 'en' && btn.dataset.enAria) btn.setAttribute('aria-label', btn.dataset.enAria);
      else if (btn.dataset.defaultAria) btn.setAttribute('aria-label', btn.dataset.defaultAria);
    });

    renderProfileSections();

    if (!activeSlug) {
      const drawerTitle = document.getElementById('drawer-title');
      if (drawerTitle) drawerTitle.textContent = t('drawer.defaultTitle');
    }

    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
      const active = btn.dataset.lang === locale;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function syncTimelineLine() {
    const wrap = document.querySelector('.about__timeline-wrap');
    if (!wrap) return;
    const line = wrap.querySelector('.about__timeline-line');
    const items = wrap.querySelectorAll('.about__timeline-item');
    if (!line || !items.length) return;

    const wrapTop = wrap.getBoundingClientRect().top;
    const firstDot = items[0].querySelector('.about__timeline-dot');
    const lastDot = items[items.length - 1].querySelector('.about__timeline-dot');
    if (!firstDot || !lastDot) return;

    const firstRect = firstDot.getBoundingClientRect();
    const lastRect = lastDot.getBoundingClientRect();
    const start = firstRect.top + firstRect.height / 2 - wrapTop;
    const end = lastRect.top + lastRect.height / 2 - wrapTop;
    line.style.top = `${start}px`;
    line.style.height = `${Math.max(0, end - start)}px`;
  }

  // Das Markup der Über-mich-Sektion kommt vollständig aus dem Build (inkl.
  // Icons); hier werden beim Sprachwechsel nur die Texte ausgetauscht.
  function skillItemsHtml(items) {
    const box = document.createElement('span');
    return (items || [])
      .map((item) => {
        box.textContent = item ?? '';
        return box.innerHTML;
      })
      .join('<span class="skill-list__sep" aria-hidden="true"> · </span>');
  }

  function renderProfileSections() {
    document.querySelectorAll('[data-skill-term]').forEach((el) => {
      el.textContent = t(`skills.groups.${el.dataset.skillTerm}`);
    });

    document.querySelectorAll('[data-skill-items]').forEach((el) => {
      const group = site.skillGroups?.find((g) => g.key === el.dataset.skillItems);
      if (!group) return;
      el.innerHTML = skillItemsHtml(group.items?.[locale] || group.items?.de || []);
    });

    document.querySelectorAll('[data-bg-index]').forEach((el) => {
      const item = site.background?.[Number(el.dataset.bgIndex)];
      if (!item) return;
      const periodEl = el.querySelector('.about__timeline-period');
      const textEl = el.querySelector('.about__timeline-text');
      if (periodEl) periodEl.textContent = item.period?.[locale] || item.period?.de || '';
      if (textEl) {
        textEl.textContent = (item.text?.[locale] || item.text?.de || '').replace(
          /\{count\}/g,
          String(totalProjects),
        );
      }
    });

    document.querySelectorAll('.about__interest-label[data-interest-key]').forEach((el) => {
      const item = site.personalInterests?.find((i) => i.key === el.dataset.interestKey);
      if (item) el.textContent = item[locale] || item.de;
    });

    requestAnimationFrame(syncTimelineLine);
  }

  async function loadSite() {
    const v = window.__ASSET_V ? `?v=${window.__ASSET_V}` : '';
    const res = await fetch(`/site.json${v}`);
    site = await res.json();
    locale = detectLocale();
    strings = site.translations[locale] || {};
    applyI18n();

    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
      btn.addEventListener('click', () => setLocale(btn.dataset.lang));
    });
  }

  const siteReady = loadSite();

  syncTimelineLine();
  window.addEventListener('resize', syncTimelineLine, { passive: true });
  document.fonts?.ready?.then(syncTimelineLine);

  const totalProjects = cards.length;

  const projectsReady = loadProjects();

  function ensureDrawerClosed() {
    if (!drawer) return;
    drawer.classList.remove('drawer--open');
    backdrop.classList.remove('drawer-backdrop--visible');
    drawer.hidden = true;
    backdrop.hidden = true;
    drawer.inert = true;
  }

  ensureDrawerClosed();

  Promise.all([siteReady, projectsReady]).then(() => handleHash());

  // Scroll-Reveal: Karten tauchen gestaffelt auf, sobald sie in den Viewport
  // kommen. Ohne IntersectionObserver werden alle sofort sichtbar.
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry, i) => {
            entry.target.style.setProperty('--stagger', String(Math.min(i, 5)));
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
    );
    cards.forEach((card) => revealObserver.observe(card));
  } else {
    cards.forEach((card) => card.classList.add('is-visible'));
  }

  // Cursor-Licht + 3D-Kipp: gemeinsame Mausposition auf den Karten.
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (finePointer) {
    document.querySelectorAll('.card__btn').forEach((btn) => {
      const resetTilt = () => {
        btn.style.setProperty('--tilt-x', '0deg');
        btn.style.setProperty('--tilt-y', '0deg');
      };

      btn.addEventListener('pointermove', (e) => {
        const rect = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        btn.style.setProperty('--my', `${e.clientY - rect.top}px`);

        if (!reduceMotion) {
          const x = (e.clientX - rect.left) / rect.width - 0.5;
          const y = (e.clientY - rect.top) / rect.height - 0.5;
          const max = 5;
          btn.style.setProperty('--tilt-x', `${(x * max * 2).toFixed(2)}deg`);
          btn.style.setProperty('--tilt-y', `${(-y * max * 2).toFixed(2)}deg`);
        }
      });

      btn.addEventListener('pointerleave', resetTilt);
    });
  }

  // Pinnwand-Foto: Pendelphysik — nur per Drag/Swipe anstupsen, Feder bringt zurück.
  const aboutPhotoPinned = document.getElementById('about-photo-pinned');
  const aboutPhotoSwing = aboutPhotoPinned?.querySelector('.about__photo-swing');
  const ABOUT_PHOTO_REST = -1.6;
  const SWING_SPRING = 0.038;
  const SWING_DAMPING = 0.925;
  const SWING_DRAG_RATIO = 0.088;
  const SWING_RELEASE_GAIN = 14;
  const SWING_MAX_VEL = 4.6;
  const SWING_MAX_ANGLE = 26;
  const SWING_SETTLE = 0.022;

  if (aboutPhotoPinned && aboutPhotoSwing && !reduceMotion) {
    let angle = ABOUT_PHOTO_REST;
    let angularVel = 0;
    let lastX = null;
    let lastTime = null;
    let grabbing = false;
    let activePointerId = null;
    let grabStartX = 0;
    let grabStartAngle = ABOUT_PHOTO_REST;
    let rafId = null;

    const clampAngle = (deg) =>
      Math.max(ABOUT_PHOTO_REST - SWING_MAX_ANGLE, Math.min(ABOUT_PHOTO_REST + SWING_MAX_ANGLE, deg));

    const setAngle = (deg) => {
      aboutPhotoPinned.style.setProperty('--swing-angle', `${deg.toFixed(2)}deg`);
    };

    const step = () => {
      if (grabbing) {
        setAngle(angle);
        rafId = requestAnimationFrame(step);
        return;
      }

      const displacement = angle - ABOUT_PHOTO_REST;
      angularVel = (angularVel - SWING_SPRING * displacement) * SWING_DAMPING;
      angle += angularVel;

      if (angle < ABOUT_PHOTO_REST - SWING_MAX_ANGLE) {
        angle = ABOUT_PHOTO_REST - SWING_MAX_ANGLE;
        angularVel *= -0.38;
      } else if (angle > ABOUT_PHOTO_REST + SWING_MAX_ANGLE) {
        angle = ABOUT_PHOTO_REST + SWING_MAX_ANGLE;
        angularVel *= -0.38;
      }

      setAngle(angle);

      const settled =
        Math.abs(angularVel) < SWING_SETTLE &&
        Math.abs(angle - ABOUT_PHOTO_REST) < SWING_SETTLE;

      if (settled) {
        angle = ABOUT_PHOTO_REST;
        angularVel = 0;
        setAngle(angle);
        rafId = null;
        return;
      }

      rafId = requestAnimationFrame(step);
    };

    const ensureAnimating = () => {
      if (rafId === null) rafId = requestAnimationFrame(step);
    };

    const resetTracking = () => {
      lastX = null;
      lastTime = null;
    };

    const startGrab = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      grabbing = true;
      activePointerId = e.pointerId;
      grabStartX = e.clientX;
      grabStartAngle = angle;
      angularVel = 0;
      lastX = e.clientX;
      lastTime = performance.now();
      aboutPhotoPinned.classList.add('about__photo--grabbing');
      aboutPhotoPinned.setPointerCapture(e.pointerId);
      ensureAnimating();
    };

    const endGrab = (e) => {
      if (!grabbing) return;
      if (activePointerId !== null && e.pointerId !== undefined && e.pointerId !== activePointerId) return;
      if (e.type === 'pointerup' && e.pointerType === 'mouse' && e.button !== 0) return;

      if (aboutPhotoPinned.hasPointerCapture(e.pointerId)) {
        aboutPhotoPinned.releasePointerCapture(e.pointerId);
      }

      grabbing = false;
      activePointerId = null;
      aboutPhotoPinned.classList.remove('about__photo--grabbing');
      resetTracking();
      ensureAnimating();
    };

    aboutPhotoPinned.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startGrab(e);
    });

    aboutPhotoPinned.addEventListener('pointermove', (e) => {
      if (!grabbing || e.pointerId !== activePointerId) return;

      const now = performance.now();
      const targetAngle = clampAngle(grabStartAngle - (e.clientX - grabStartX) * SWING_DRAG_RATIO);

      if (lastX !== null && lastTime !== null) {
        const dt = Math.max(10, now - lastTime);
        const vx = (e.clientX - lastX) / dt;
        const instantVel = -vx * SWING_DRAG_RATIO * SWING_RELEASE_GAIN;
        angularVel = angularVel * 0.25 + instantVel * 0.75;
        angularVel = Math.max(-SWING_MAX_VEL, Math.min(SWING_MAX_VEL, angularVel));
      }

      angle = targetAngle;
      setAngle(angle);
      lastX = e.clientX;
      lastTime = now;
    });

    aboutPhotoPinned.addEventListener('pointerup', endGrab);
    aboutPhotoPinned.addEventListener('pointercancel', endGrab);
    aboutPhotoPinned.addEventListener('lostpointercapture', endGrab);
    window.addEventListener('pointerup', endGrab);
    window.addEventListener('blur', () => {
      if (grabbing) endGrab({ pointerId: activePointerId, clientX: lastX ?? 0, clientY: 0 });
    });

    setAngle(ABOUT_PHOTO_REST);
  } else if (aboutPhotoPinned) {
    aboutPhotoPinned.style.setProperty('--swing-angle', `${ABOUT_PHOTO_REST}deg`);
  }

  openButtons.forEach((btn) => {
    btn.addEventListener('click', () => openDrawer(btn.dataset.open));
  });

  facetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const next = chip.dataset.filter;
      setFilter(activeFilter === next && next !== 'all' ? 'all' : next);
      if (facetSheetOpen) closeFacetSheet({ restoreFocus: false });
    });
  });

  function updateFacetActiveChip(filter) {
    if (!facetActiveChip || !facetActiveChipLabel || !facetActiveChipCount) return;
    if (filter === 'all') {
      facetActiveChip.hidden = true;
      facetActiveChipLabel.textContent = '';
      facetActiveChipCount.textContent = '';
      if (facetActiveChipIcon) facetActiveChipIcon.innerHTML = '';
      return;
    }
    const refChip = document.querySelector(
      `.facet-bar--sheet .facet-chip[data-filter="${filter}"]:not(.facet-chip--all)`,
    );
    if (!refChip) return;
    const label = refChip.querySelector('.facet-chip__label')?.textContent?.trim() || '';
    const count = refChip.querySelector('.facet-chip__count')?.textContent?.trim() || '';
    const icon = refChip.querySelector('.facet-chip__icon');
    facetActiveChipLabel.textContent = label;
    facetActiveChipCount.textContent = count;
    if (facetActiveChipIcon) {
      facetActiveChipIcon.innerHTML = icon ? icon.outerHTML : '';
    }
    facetActiveChip.setAttribute('aria-label', t('facets.clearFilter', { label }));
    facetActiveChip.hidden = false;
  }

  function openFacetSheet() {
    if (!facetSheet || facetSheetOpen) return;
    lastFacetFocus = document.activeElement;
    facetSheetOpen = true;
    facetSheet.hidden = false;
    facetSheet.inert = false;
    facetOpen?.setAttribute('aria-expanded', 'true');
    void facetSheet.offsetWidth;
    facetSheet.classList.add('facet-sheet--open');
    lockBodyScroll();
    (facetClose || facetSheet.querySelector('.facet-chip'))?.focus({ preventScroll: true });
  }

  function closeFacetSheet({ restoreFocus = true } = {}) {
    if (!facetSheet || !facetSheetOpen) return;
    facetSheetOpen = false;
    facetSheet.classList.remove('facet-sheet--open');
    facetSheet.inert = true;
    facetOpen?.setAttribute('aria-expanded', 'false');
    unlockBodyScroll();

    const panel = facetSheet.querySelector('.facet-sheet__panel');
    const finishClose = () => {
      if (facetSheetOpen) return;
      facetSheet.hidden = true;
      if (restoreFocus) lastFacetFocus?.focus({ preventScroll: true });
    };

    const onEnd = (event) => {
      if (event.target !== panel || event.propertyName !== 'transform') return;
      panel.removeEventListener('transitionend', onEnd);
      finishClose();
    };

    panel?.addEventListener('transitionend', onEnd);
    window.setTimeout(finishClose, 500);
  }

  facetOpen?.addEventListener('click', openFacetSheet);
  facetClose?.addEventListener('click', () => closeFacetSheet());
  facetBackdrop?.addEventListener('click', () => closeFacetSheet());
  facetActiveChip?.addEventListener('click', () => setFilter('all'));

  window.matchMedia('(max-width: 640px)').addEventListener('change', (e) => {
    if (!e.matches && facetSheetOpen) closeFacetSheet({ restoreFocus: false });
  });

  // Easter Egg: „Video- & Brettspiele" lädt snake.js nach und startet das
  // Spiel. Die Strings kommen aus der aktiven Sprache. Auf Mobile (≤640px)
  // bleibt der Eintrag reiner Text — Snake ist dort nicht spielbar.
  const eggBtn = document.getElementById('egg-snake');
  const snakeEggMobile = window.matchMedia('(max-width: 640px)');
  if (eggBtn && snakeEggMobile.matches) {
    eggBtn.setAttribute('tabindex', '-1');
    eggBtn.setAttribute('aria-disabled', 'true');
  } else if (eggBtn) {
    eggBtn.addEventListener('click', () => {
      const start = () =>
        window.__startSnake?.({
          trigger: eggBtn,
          strings: {
            hint: t('snake.hint'),
            score: t('snake.score'),
            scoreShort: t('snake.scoreShort'),
            level: t('snake.level'),
            levelShort: t('snake.levelShort'),
            gameOver: t('snake.gameOver'),
            yourScore: t('snake.yourScore'),
            bestScore: t('snake.bestScore'),
            newBest: t('snake.newBest'),
            scoreboardAria: t('snake.scoreboardAria'),
            playAgain: t('snake.playAgain'),
            close: t('snake.close'),
          },
        });
      if (window.__startSnake) {
        start();
        return;
      }
      const script = document.createElement('script');
      script.src = `/snake.js${window.__ASSET_V ? `?v=${window.__ASSET_V}` : ''}`;
      script.onload = start;
      document.head.appendChild(script);
    });
  }

  async function loadProjects() {
    const v = window.__ASSET_V ? `?v=${window.__ASSET_V}` : '';
    const res = await fetch(`/projects.json${v}`);
    const data = await res.json();
    for (const section of data.sections) {
      for (const p of section.projects) {
        projects[p.slug] = p;
      }
    }
  }

  function setFilter(filter) {
    activeFilter = filter;

    facetChips.forEach((chip) => {
      const isActive = chip.dataset.filter === filter;
      chip.classList.toggle('is-active', isActive);
      chip.setAttribute('aria-pressed', String(isActive));
    });

    cards.forEach((card) => {
      const facets = (card.dataset.facets || '').split(',').filter(Boolean);
      const show = filter === 'all' || facets.includes(filter);
      card.classList.toggle('card--hidden', !show);
    });

    document.querySelectorAll('.section').forEach((section) => {
      const sectionCards = section.querySelectorAll('.card:not(.card--hidden)');
      const isEmpty = sectionCards.length === 0;
      if (section.classList.contains('section--catalog')) {
        section.classList.toggle('section--grid-empty', isEmpty);
      } else {
        section.classList.toggle('section--empty', isEmpty);
      }
    });

    if (filter !== 'all') {
      document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    updateFacetActiveChip(filter);
  }

  function esc(str) {
    const el = document.createElement('span');
    el.textContent = str ?? '';
    return el.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const loc = locale === 'en' ? 'en-GB' : 'de-DE';
      return new Date(iso).toLocaleDateString(loc, { year: 'numeric', month: 'short' });
    } catch {
      return iso.slice(0, 10);
    }
  }

  function renderStatLine(project) {
    const parts = [];
    if (project.locFormatted && project.locFormatted !== '—') {
      parts.push(`<span class="stat-inline__item"><strong>${esc(project.locFormatted)}</strong> ${esc(t('drawer.linesOfCode'))}</span>`);
    }
    if (project.git?.commits) {
      parts.push(`<span class="stat-inline__item"><strong>${project.git.commits}</strong> ${esc(t('drawer.commits'))}</span>`);
    }
    const tests = project.ux?.testFiles ?? project.files?.tests;
    if (tests > 0) {
      parts.push(`<span class="stat-inline__item"><strong>${tests}</strong> ${esc(t('drawer.tests'))}</span>`);
    }
    if (!parts.length) return '';
    return `<p class="stat-inline" aria-label="${esc(t('drawer.statsAria'))}">${parts.join('<span class="stat-inline__sep" aria-hidden="true">·</span>')}</p>`;
  }

  function renderCoverage(coverage) {
    if (!coverage) return '';
    const items = [
      [t('drawer.lines'), coverage.lines],
      ['Statements', coverage.statements],
      ['Branches', coverage.branches],
      ['Functions', coverage.functions],
    ].filter(([, v]) => v != null);
    if (!items.length) return '';
    return `
      <div class="metric-block">
        <h3 class="metric-block__title">${esc(t('drawer.coverage'))}</h3>
        ${items
          .map(
            ([label, val]) => `
          <div class="coverage-row">
            <span class="coverage-row__label">${esc(label)}</span>
            <div class="coverage-row__bar" role="presentation"><span style="width:${val}%"></span></div>
            <span class="coverage-row__val">${val}%</span>
          </div>`,
          )
          .join('')}
      </div>`;
  }

  function renderDepGroup(title, deps) {
    if (!deps?.length) return '';
    return `
      <details class="dep-group" open>
        <summary class="dep-group__title">${esc(title)} <span class="dep-group__count">${deps.length}</span></summary>
        <div class="dep-group__list">${deps.map((d) => `<code class="dep-tag">${esc(d)}</code>`).join('')}</div>
      </details>`;
  }

  function renderTagList(title, items) {
    if (!items?.length) return '';
    return `
      <div class="metric-block">
        <h3 class="metric-block__title">${esc(title)}</h3>
        <div class="drawer__tags">${items.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>`;
  }

  function localizedCopy(project) {
    const block = project.copy?.[locale] || project.copy?.de || {};
    return {
      overview: block.overview || project.overview || '',
      uxNarrative: block.uxNarrative || project.uxNarrative || '',
      highlights: block.highlights?.length ? block.highlights : project.highlights || [],
    };
  }

  function renderAiBadge() {
    return `<span class="drawer__ai-badge" title="${esc(t('drawer.aiGenerated'))}">
      <span aria-hidden="true">${esc(t('drawer.aiBadge'))}</span>
      <span class="sr-only">${esc(t('drawer.aiGenerated'))}</span>
    </span>`;
  }

  function renderProse(text) {
    if (!text) return '';
    return `<div class="drawer__prose">${text
      .split(/\n\n+/)
      .map((p) => `<p>${esc(p.trim())}</p>`)
      .join('')}</div>`;
  }

  function renderAiCopy(innerHtml) {
    if (!innerHtml) return '';
    return `<div class="drawer__copy">${renderAiBadge()}${innerHtml}</div>`;
  }

  function renderOverview(project) {
    const copy = localizedCopy(project);
    const highlights =
      copy.highlights.length > 0
        ? `<ul class="drawer__highlights">${copy.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`
        : '';

    const prose = renderProse(copy.overview);
    const copyHtml = prose || highlights ? renderAiCopy(`${prose}${highlights}`) : '';

    return `
      ${copyHtml}
      ${project.stack?.length ? renderTagList(t('drawer.techStack'), project.stack) : ''}`;
  }

  function renderUx(project) {
    const ux = project.ux || {};
    const { uxNarrative } = localizedCopy(project);
    const narrative = uxNarrative ? renderAiCopy(renderProse(uxNarrative)) : '';
    const blocks = [];

    if (ux.uiFrameworks?.length) blocks.push(renderTagList(t('drawer.uiFrameworks'), ux.uiFrameworks));
    if (ux.a11yTools?.length) blocks.push(renderTagList(t('drawer.a11y'), ux.a11yTools));

    const testing = [...(ux.unitTools || []), ...(ux.e2eTools || [])];
    if (testing.length) blocks.push(renderTagList(t('drawer.testing'), testing));

    const fileStats = [
      [t('drawer.tsxFiles'), ux.tsxFiles],
      [t('drawer.componentFolders'), ux.componentCount],
      [t('drawer.testFiles'), ux.testFiles],
    ].filter(([, v]) => v > 0);

    const signalsHtml =
      blocks.length || fileStats.length
        ? `<div class="metric-block metric-block--subtle">
            ${blocks.join('')}
            ${
              fileStats.length
                ? `<dl class="kv-list">${fileStats.map(([k, v]) => `<div class="kv-row"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`
                : ''
            }
          </div>`
        : '';

    if (!narrative && !signalsHtml) {
      return `<p class="drawer__empty">${esc(t('drawer.uxEmpty'))}</p>`;
    }

    return narrative + signalsHtml;
  }

  function renderTech(project) {
    const deps = project.dependencies || {};
    const loc = project.loc;

    const langHtml = loc?.byLanguage
      ? `<div class="metric-block">
          <h3 class="metric-block__title">${esc(t('drawer.codeByLang'))}</h3>
          <dl class="kv-list">${Object.entries(loc.byLanguage)
            .sort((a, b) => b[1] - a[1])
            .map(([lang, n]) => `<div class="kv-row"><dt>${esc(lang)}</dt><dd>${n.toLocaleString(locale === 'en' ? 'en-GB' : 'de-DE')} ${esc(t('drawer.lines'))}</dd></div>`)
            .join('')}</dl>
        </div>`
      : '';

    const gitHtml = project.git
      ? `<div class="metric-block">
          <h3 class="metric-block__title">${esc(t('drawer.git'))}</h3>
          <dl class="kv-list">
            <div class="kv-row"><dt>${esc(t('drawer.commits'))}</dt><dd>${project.git.commits}</dd></div>
            <div class="kv-row"><dt>${esc(t('drawer.firstCommit'))}</dt><dd>${formatDate(project.git.firstCommit)}</dd></div>
            <div class="kv-row"><dt>${esc(t('drawer.lastCommit'))}</dt><dd>${formatDate(project.git.lastCommit)}</dd></div>
          </dl>
        </div>`
      : '';

    const depHtml = `
      <div class="metric-block">
        <h3 class="metric-block__title">${esc(t('drawer.libraries', { count: project.dependencyCount || 0 }))}</h3>
        ${renderDepGroup(t('drawer.depUi'), deps.ui)}
        ${renderDepGroup(t('drawer.depData'), deps.data)}
        ${renderDepGroup(t('drawer.depAi'), deps.ai)}
        ${renderDepGroup(t('drawer.depInfra'), deps.infra)}
        ${renderDepGroup(t('drawer.depTesting'), deps.testing)}
        ${renderDepGroup(t('drawer.depOther'), deps.other)}
      </div>`;

    return langHtml + renderCoverage(project.coverage) + gitHtml + depHtml;
  }

  function switchTab(tabId) {
    activeTab = tabId;
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === tabId;
      tab.classList.toggle('drawer__tab--active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    Object.entries(panels).forEach(([key, panel]) => {
      const active = key === tabId;
      panel.classList.toggle('drawer__panel--active', active);
      panel.hidden = !active;
    });
  }

  function renderResponsivePicture(shot, { sizes, alt, loading = 'lazy' } = {}) {
    const avif = shot.srcset?.avif;
    const webp = shot.srcset?.webp;
    return `<picture>
      ${avif ? `<source type="image/avif" srcset="${esc(avif)}" sizes="${sizes}" />` : ''}
      ${webp ? `<source type="image/webp" srcset="${esc(webp)}" sizes="${sizes}" />` : ''}
      <img src="${esc(shot.src)}" alt="${esc(alt)}" width="${shot.width || 1280}" height="${shot.height || 800}" loading="${loading}" decoding="async" />
    </picture>`;
  }

  function shotLabel(shot) {
    return shot.label?.[locale] || shot.label?.de || shot.id;
  }

  function shotAlt(shot, index, total, projectName) {
    return t('drawer.screenshotSlide', {
      current: index + 1,
      total,
      label: shotLabel(shot),
      name: projectName,
    });
  }

  function parseYoutubeId(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.hostname === 'youtu.be') return u.pathname.replace(/^\//, '').split('/')[0] || null;
      if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    } catch {
      return null;
    }
    return null;
  }

  function youtubeThumbnails(ytId) {
    const base = `https://i.ytimg.com/vi/${ytId}`;
    return {
      src: `${base}/maxresdefault.jpg`,
      fallback: `${base}/mqdefault.jpg`,
    };
  }

  function buildDrawerSlides(project) {
    const shots = project.screenshots?.length ? [...project.screenshots] : [];
    const ytId = parseYoutubeId(project.productVideo);
    if (ytId) {
      const thumbs = youtubeThumbnails(ytId);
      shots.unshift({
        id: 'product-video',
        type: 'video',
        youtubeId: ytId,
        thumbnail: thumbs.src,
        thumbnailFallback: thumbs.fallback,
        src: thumbs.src,
        width: 1280,
        height: 720,
        label: { de: 'Video', en: 'Video' },
      });
    }
    return shots;
  }

  const playIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72L19 12 8 5.14z"/></svg>`;

  let drawerGallery = { index: 0, shots: [], project: null, go: null, media: null };

  function bindDrawerMediaInteractions(media) {
    media.querySelectorAll('[data-gallery-open]').forEach((btn) => {
      btn.addEventListener('click', () => openDrawerSlide(Number(btn.dataset.galleryOpen)));
    });
  }

  function bindDrawerGallery(media) {
    const track = media.querySelector('[data-gallery-track]');
    const prev = media.querySelector('[data-gallery-prev]');
    const next = media.querySelector('[data-gallery-next]');
    if (!track) return;

    const go = (index) => {
      const max = drawerGallery.shots.length;
      if (!max) return;
      drawerGallery.index = ((index % max) + max) % max;
      track.style.setProperty('--gallery-index', String(drawerGallery.index));
    };

    drawerGallery.go = go;
    prev?.addEventListener('click', (e) => {
      e.stopPropagation();
      go(drawerGallery.index - 1);
    });
    next?.addEventListener('click', (e) => {
      e.stopPropagation();
      go(drawerGallery.index + 1);
    });

    let startX = null;
    const viewport = media.querySelector('.drawer__gallery-viewport');
    viewport?.addEventListener('pointerdown', (e) => {
      if (e.target.closest('[data-gallery-prev], [data-gallery-next]')) return;
      startX = e.clientX;
    });
    viewport?.addEventListener('pointerup', (e) => {
      if (startX == null) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 48) go(drawerGallery.index + (dx < 0 ? 1 : -1));
      startX = null;
    });

    bindDrawerMediaInteractions(media);
  }

  function renderGallerySlide(shot, i, project, total) {
    const label = shotLabel(shot);
    const alt = shotAlt(shot, i, total, project.name);
    if (shot.type === 'video') {
      const fallback = esc(shot.thumbnailFallback || shot.thumbnail);
      return `<figure class="drawer__gallery-slide" role="group" aria-roledescription="slide" aria-label="${esc(alt)}" data-slide="${i}">
      <button type="button" class="drawer__gallery-hit drawer__gallery-hit--video" data-gallery-open="${i}" aria-label="${esc(t('drawer.enlargeScreenshotNamed', { label }))}">
        <img src="${esc(shot.thumbnail)}" alt="" width="1280" height="720" loading="eager" decoding="async" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=''}" data-fallback="${fallback}" />
        <span class="drawer__gallery-play" aria-hidden="true">${playIcon}</span>
      </button>
    </figure>`;
    }
    return `<figure class="drawer__gallery-slide" role="group" aria-roledescription="slide" aria-label="${esc(alt)}" data-slide="${i}">
      <button type="button" class="drawer__gallery-hit" data-gallery-open="${i}" aria-label="${esc(t('drawer.enlargeScreenshotNamed', { label }))}">
        ${renderResponsivePicture(shot, { sizes: '100vw', alt, loading: 'eager' })}
      </button>
    </figure>`;
  }

  function renderDrawerMedia(project) {
    const media = document.getElementById('drawer-media');
    media.style.setProperty('--accent', project.accent);
    const shots = buildDrawerSlides(project);

    if (!shots.length) {
      const shot = `/screenshots/${project.slug}.png`;
      media.innerHTML = `<button type="button" class="drawer__media-hit" data-gallery-open="0" aria-label="${esc(t('drawer.enlargeScreenshot', { name: project.name }))}">
        <img src="${shot}" alt="${esc(t('drawer.screenshotAlt', { name: project.name }))}" onerror="this.closest('.drawer__media').classList.add('drawer__media--fallback');this.remove()" />
      </button>`;
      media.classList.remove('drawer__media--fallback', 'drawer__media--gallery');
      media.classList.add('drawer__media--zoomable');
      drawerGallery = {
        index: 0,
        shots: [{
          id: 'landing',
          src: shot,
          width: 1280,
          height: 800,
          label: { de: 'Startseite', en: 'Landing page' },
        }],
        project,
        go: null,
        media,
      };
      bindDrawerMediaInteractions(media);
      return;
    }

    media.classList.remove('drawer__media--fallback', 'drawer__media--zoomable');
    media.classList.add('drawer__media--gallery');

    const slides = shots.map((shot, i) => renderGallerySlide(shot, i, project, shots.length)).join('');
    const multi = shots.length > 1;

    media.innerHTML = `
    <div class="drawer__gallery" data-drawer-gallery>
      <div class="drawer__gallery-viewport">
        <div class="drawer__gallery-track" data-gallery-track style="--gallery-index: 0">
          ${slides}
        </div>
        ${
          multi
            ? `<button type="button" class="drawer__gallery-nav drawer__gallery-nav--prev" data-gallery-prev aria-label="${esc(t('drawer.prevScreenshot'))}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 6l-6 6 6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="drawer__gallery-nav drawer__gallery-nav--next" data-gallery-next aria-label="${esc(t('drawer.nextScreenshot'))}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 6l6 6-6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>`
            : ''
        }
      </div>
    </div>`;

    drawerGallery = { index: 0, shots, project, go: null, media };
    if (multi) bindDrawerGallery(media);
    else bindDrawerMediaInteractions(media);
  }

  function renderDrawer(project) {
    document.getElementById('drawer-title').textContent = project.name;
    document.getElementById('drawer-stats').innerHTML = renderStatLine(project);
    panels.overview.innerHTML = renderOverview(project);
    panels.ux.innerHTML = renderUx(project);
    panels.tech.innerHTML = renderTech(project);
    switchTab('overview');

    renderDrawerMedia(project);

    document.getElementById('drawer-hero-overlay').innerHTML = '';

    const introActions = document.getElementById('drawer-intro-actions');
    introActions.innerHTML = `
      <a class="drawer__visit" href="${esc(project.url)}" target="_blank" rel="noopener noreferrer">
        <span>${esc(t('drawer.visit'))}</span>
        <span class="sr-only">${esc(t('a11y.externalHint'))}</span>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M5.5 3.5H12.5V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3.5 12.5L12 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </a>`;

    const actionLinks = [];
    if (project.github) {
      actionLinks.push(`<a class="btn btn--ghost" href="${esc(project.github)}" target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        ${esc(t('drawer.github'))}
        <span class="sr-only">${esc(t('a11y.externalHint'))}</span>
      </a>`);
    }
    const actions = document.getElementById('drawer-actions');
    actions.innerHTML = actionLinks.join('');

    drawer.style.setProperty('--accent', project.accent);
    drawer.style.setProperty('--accent-light', project.accentCtaLight || project.accent);
    drawer.style.setProperty('--accent-ink', project.accentInk || project.accentCtaLight || project.accent);
    drawer.style.setProperty('--accent-btn', project.accentBtn || project.accent);
    backdrop.style.setProperty('--accent', project.accent);
    backdrop.style.setProperty('--accent-ink', project.accentInk || project.accentCtaLight || project.accent);
    backdrop.style.setProperty('--accent-tint', project.accentInk || project.accentCtaLight || project.accent);
    syncDrawerScrollGutter();
  }

  let savedScrollY = 0;
  let scrollLockDepth = 0;

  function getScrollbarWidth() {
    const html = document.documentElement;
    const clientGap = window.innerWidth - html.clientWidth;
    if (clientGap > 0) return clientGap;
    // scrollbar-gutter: stable reserviert Platz über offsetWidth, nicht clientWidth.
    const offsetGap = window.innerWidth - html.offsetWidth;
    return Math.max(0, offsetGap);
  }

  // Scroll sperren ohne Layout-Shift: Scrollbar-Breite per Padding ausgleichen,
  // Scroll-Position per position:fixed + top beibehalten.
  function lockBodyScroll() {
    if (scrollLockDepth === 0) {
      savedScrollY = window.scrollY;
      const scrollbarWidth = getScrollbarWidth();
      document.documentElement.classList.add('drawer-open');
      document.body.classList.add('drawer-open');
      if (savedScrollY > 0) {
        document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
        document.documentElement.classList.add('drawer-open--scroll-lock');
        document.body.style.top = `-${savedScrollY}px`;
      } else if (scrollbarWidth > 0) {
        document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
        document.documentElement.classList.add('drawer-open--gutter-lock');
      }
    }
    scrollLockDepth += 1;
  }

  function clearBodyScrollLockState() {
    const scrollY = savedScrollY;
    const html = document.documentElement;
    const body = document.body;

    body.style.removeProperty('top');
    body.classList.remove('drawer-open');
    html.classList.remove('drawer-open');
    html.classList.remove('drawer-open--scroll-lock');
    html.classList.remove('drawer-open--gutter-lock');
    html.style.removeProperty('--scrollbar-width');

    if (scrollY > 0) {
      html.style.scrollBehavior = 'auto';
      html.scrollTop = scrollY;
      body.scrollTop = scrollY;
      window.scrollTo(0, scrollY);
      html.style.removeProperty('scroll-behavior');
    }
  }

  function unlockBodyScroll() {
    if (scrollLockDepth === 0) return;
    scrollLockDepth -= 1;
    if (scrollLockDepth > 0) return;
    clearBodyScrollLockState();
  }

  function resetBodyScrollLockIfIdle() {
    if (activeSlug || facetSheetOpen || videoModalOpen || scrollLockDepth === 0) return;
    scrollLockDepth = 0;
    clearBodyScrollLockState();
  }

  function finishDrawerClose() {
    if (activeSlug || drawerCloseFinished) return;
    drawerCloseFinished = true;

    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    drawer.removeEventListener('transitionend', onCloseTransitionEnd);

    unlockBodyScroll();
    resetBodyScrollLockIfIdle();

    requestAnimationFrame(() => {
      hideDrawerElements();
      requestAnimationFrame(() => {
        lastFocus?.focus({ preventScroll: true });
      });
    });
  }

  // Verbirgt den Drawer erst nach der Schließen-Animation. Bricht ab, falls
  // inzwischen wieder ein Projekt geöffnet wurde (verhindert das „reinfahren
  // und sofort verschwinden" bei schnellem Wechsel zwischen Karten).
  function hideDrawerElements() {
    if (activeSlug) return;
    if (backdrop) {
      backdrop.style.setProperty('-webkit-backdrop-filter', 'none');
      backdrop.style.setProperty('backdrop-filter', 'none');
    }
    drawer.hidden = true;
    backdrop.hidden = true;
    drawer.removeEventListener('transitionend', onCloseTransitionEnd);
    const drawerTitle = document.getElementById('drawer-title');
    if (drawerTitle) drawerTitle.textContent = t('drawer.defaultTitle');
  }

  function onCloseTransitionEnd(event) {
    if (event.target !== drawer || event.propertyName !== 'transform') return;
    finishDrawerClose();
  }

  function cancelPendingClose() {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    drawer.removeEventListener('transitionend', onCloseTransitionEnd);
  }

  function resetDrawerScroll() {
    const scrollArea = drawer.querySelector('.drawer__scroll');
    if (!scrollArea) return;
    scrollArea.scrollTo(0, 0);
    requestAnimationFrame(() => {
      scrollArea.scrollTo(0, 0);
      syncDrawerScrollGutter();
    });
  }

  function syncDrawerScrollGutter() {
    const scrollArea = drawer?.querySelector('.drawer__scroll');
    if (!scrollArea) return;
    const gutter = Math.max(0, scrollArea.offsetWidth - scrollArea.clientWidth);
    scrollArea.style.setProperty('--drawer-scroll-gutter', `${gutter}px`);
  }

  let drawerScrollGutterObserver = null;

  function bindDrawerScrollGutterSync() {
    const scrollArea = drawer?.querySelector('.drawer__scroll');
    if (!scrollArea || drawerScrollGutterObserver) return;
    drawerScrollGutterObserver = new ResizeObserver(() => syncDrawerScrollGutter());
    drawerScrollGutterObserver.observe(scrollArea);
    syncDrawerScrollGutter();
  }

  function openDrawer(slug) {
    return projectsReady.then(() => {
      const project = projects[slug];
      if (!project || !drawer) return;

      cancelPendingClose();
      drawerCloseFinished = false;

      if (facetSheetOpen) closeFacetSheet({ restoreFocus: false });

      if (!activeSlug) {
        lastFocus = document.activeElement;
      }
      activeSlug = slug;
      renderDrawer(project);
      resetDrawerScroll();

      drawer.inert = false;
      drawer.hidden = false;
      backdrop.hidden = false;
      backdrop.style.removeProperty('-webkit-backdrop-filter');
      backdrop.style.removeProperty('backdrop-filter');
      void drawer.offsetWidth;
      drawer.classList.add('drawer--open');
      backdrop.classList.add('drawer-backdrop--visible');

      resetDrawerScroll();
      if (!document.documentElement.classList.contains('drawer-open')) {
        lockBodyScroll();
      }
      openButtons.forEach((btn) => {
        btn.setAttribute('aria-expanded', btn.dataset.open === slug ? 'true' : 'false');
      });

      history.replaceState(null, '', `#${slug}`);
      requestAnimationFrame(() => {
        resetDrawerScroll();
        closeBtn.focus({ preventScroll: true });
      });
    });
  }

  function closeDrawer() {
    if (!activeSlug) return;

    closeShotLightbox();
    if (videoModalOpen) closeVideoModal();

    cancelPendingClose();
    drawerCloseFinished = false;

    drawer.classList.remove('drawer--open');
    backdrop.classList.remove('drawer-backdrop--visible');
    drawer.inert = true;
    resetDrawerScroll();

    activeSlug = null;

    drawer.addEventListener('transitionend', onCloseTransitionEnd);
    closeTimer = window.setTimeout(finishDrawerClose, 500);

    openButtons.forEach((btn) => btn.setAttribute('aria-expanded', 'false'));

    if (location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  async function handleHash() {
    await projectsReady;
    const slug = location.hash.slice(1);
    if (!slug || !projects[slug] || activeSlug === slug) return;
    openDrawer(slug);
  }

  closeBtn?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  bindDrawerScrollGutterSync();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (videoModalOpen) closeVideoModal();
      else if (shotLightboxOpen) closeShotLightbox();
      else if (facetSheetOpen) closeFacetSheet();
      else if (activeSlug) closeDrawer();
      return;
    }
    if (shotLightboxOpen && drawerGallery.shots.length > 1) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goShotLightbox(drawerGallery.index - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goShotLightbox(drawerGallery.index + 1);
      }
    } else if (activeSlug && drawerGallery.shots.length > 1 && drawerGallery.go) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        drawerGallery.go(drawerGallery.index - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        drawerGallery.go(drawerGallery.index + 1);
      }
    }
    trapShotLightboxFocus(e);
    trapFacetSheetFocus(e);
    trapDrawerFocus(e);
    trapVideoModalFocus(e);
  });

  function trapFacetSheetFocus(e) {
    if (!facetSheetOpen || e.key !== 'Tab' || facetSheet.hidden) return;
    const panel = facetSheet.querySelector('.facet-sheet__panel');
    if (!panel) return;
    const focusable = panel.querySelectorAll(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function trapDrawerFocus(e) {
    if (!activeSlug || e.key !== 'Tab' || drawer.hidden) return;
    const focusable = drawer.querySelectorAll(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // ── Screenshot-Lightbox (Drawer) ──
  const shotLightbox = document.getElementById('shot-lightbox');
  const shotLightboxSideLeft = document.getElementById('shot-lightbox-side-left');
  const shotLightboxSideRight = document.getElementById('shot-lightbox-side-right');
  const shotLightboxTopZone = document.getElementById('shot-lightbox-top-zone');
  const shotLightboxDialog = document.getElementById('shot-lightbox-dialog');
  const shotLightboxMedia = document.getElementById('shot-lightbox-media');
  const shotLightboxCaption = document.getElementById('shot-lightbox-caption');
  const shotLightboxCounter = document.getElementById('shot-lightbox-counter');
  const shotLightboxClose = document.getElementById('shot-lightbox-close');
  const shotLightboxPrev = document.getElementById('shot-lightbox-prev');
  const shotLightboxNext = document.getElementById('shot-lightbox-next');
  let shotLightboxOpen = false;
  let shotLightboxLastFocus = null;

  function shotLightboxAspect(shot) {
    const w = shot.width || 1280;
    const h = shot.height || (shot.type === 'video' ? 720 : 800);
    return w / h;
  }

  function shotLightboxBounds(shot) {
    const ratio = shotLightboxAspect(shot);
    const maxW = Math.min(1280, window.innerWidth * 0.92);
    const maxH = window.innerHeight * 0.88 - 32;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }

  function applyShotLightboxSize(shot) {
    if (!shotLightbox || !shot) return;
    const { w, h } = shotLightboxBounds(shot);
    shotLightbox.style.setProperty('--shot-lightbox-w', `${w}px`);
    shotLightbox.style.setProperty('--shot-lightbox-h', `${h}px`);
  }

  function clearShotLightboxSize() {
    shotLightbox?.style.removeProperty('--shot-lightbox-w');
    shotLightbox?.style.removeProperty('--shot-lightbox-h');
  }

  function renderShotLightboxVideoPreview(shot) {
    const fallback = esc(shot.thumbnailFallback || shot.thumbnail);
    return `<div class="shot-lightbox__video-preview">
      <img src="${esc(shot.thumbnail)}" alt="" width="1280" height="720" decoding="async" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=''}" data-fallback="${fallback}" />
      <button type="button" class="shot-lightbox__play" data-shot-lightbox-play aria-label="${esc(t('drawer.playVideo'))}">
        ${playIcon}
      </button>
    </div>`;
  }

  function playShotLightboxVideo(shot) {
    if (!shot?.youtubeId || !shotLightboxMedia) return;
    const title = `${drawerGallery.project?.name || ''} – ${shotLabel(shot)}`;
    shotLightboxMedia.innerHTML = `<div class="shot-lightbox__video-frame">
      <iframe src="${youtubeEmbedUrl(shot.youtubeId)}" title="${esc(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
    </div>`;
  }

  function bindShotLightboxMediaInteractions(shot) {
    shotLightboxMedia?.querySelector('[data-shot-lightbox-play]')?.addEventListener('click', () => {
      playShotLightboxVideo(shot);
    });
  }

  function openDrawerSlide(index) {
    openShotLightbox(index);
  }

  function renderShotLightboxSlide(index) {
    const max = drawerGallery.shots.length;
    if (!max || !shotLightboxMedia || !shotLightboxCaption) return;

    const i = ((index % max) + max) % max;
    drawerGallery.index = i;
    if (drawerGallery.go) drawerGallery.go(i);

    const shot = drawerGallery.shots[i];
    if (!shot) return;

    const projectName = drawerGallery.project?.name || '';
    const label = shotLabel(shot);
    const alt = shotAlt(shot, i, max, projectName);

    if (shot.type === 'video') {
      shotLightboxMedia.innerHTML = renderShotLightboxVideoPreview(shot);
      bindShotLightboxMediaInteractions(shot);
    } else {
      shotLightboxMedia.innerHTML = renderResponsivePicture(shot, {
        sizes: '96vw',
        alt,
        loading: 'eager',
      });
    }
    shotLightboxCaption.textContent = label;
    applyShotLightboxSize(shot);

    if (shot.type !== 'video') {
      shotLightboxMedia.querySelector('img')?.addEventListener('load', () => {
        const img = shotLightboxMedia.querySelector('img');
        if (!img?.naturalWidth) return;
        applyShotLightboxSize({
          ...shot,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      }, { once: true });
    }

    if (shotLightboxPrev) shotLightboxPrev.hidden = max <= 1;
    if (shotLightboxNext) shotLightboxNext.hidden = max <= 1;
    if (shotLightboxCounter) {
      shotLightboxCounter.hidden = max <= 1;
      if (max > 1) {
        shotLightboxCounter.textContent = t('drawer.lightboxCounter', {
          current: i + 1,
          total: max,
        });
      }
    }
  }

  function goShotLightbox(index) {
    renderShotLightboxSlide(index);
  }

  function resetShotLightboxHover() {
    shotLightbox?.classList.remove('shot-lightbox--top-hover', 'shot-lightbox--side-hover');
  }

  function bindShotLightboxSideZone(el) {
    el?.addEventListener('mouseenter', () => {
      shotLightbox?.classList.add('shot-lightbox--side-hover');
    });
    el?.addEventListener('mouseleave', () => {
      shotLightbox?.classList.remove('shot-lightbox--side-hover');
    });
    el?.addEventListener('click', closeShotLightbox);
  }

  function openShotLightbox(index = drawerGallery.index) {
    if (!shotLightbox || !drawerGallery.shots.length) return;
    const shot = drawerGallery.shots[index];
    if (!shot) return;

    shotLightboxLastFocus = document.activeElement;
    shotLightboxOpen = true;
    resetShotLightboxHover();
    renderShotLightboxSlide(index);
    shotLightbox.hidden = false;
    requestAnimationFrame(() => {
      shotLightbox.classList.add('shot-lightbox--open');
      shotLightboxDialog?.focus({ preventScroll: true });
    });
  }

  function closeShotLightbox() {
    if (!shotLightboxOpen || !shotLightbox) return;

    shotLightboxOpen = false;
    shotLightbox.classList.remove('shot-lightbox--open');
    resetShotLightboxHover();
    if (shotLightboxMedia) shotLightboxMedia.innerHTML = '';
    clearShotLightboxSize();
    shotLightbox.hidden = true;
    shotLightboxLastFocus?.focus({ preventScroll: true });
  }

  shotLightboxTopZone?.addEventListener('click', closeShotLightbox);
  shotLightboxTopZone?.addEventListener('mouseenter', () => {
    shotLightbox?.classList.add('shot-lightbox--top-hover');
  });
  shotLightboxTopZone?.addEventListener('mouseleave', () => {
    shotLightbox?.classList.remove('shot-lightbox--top-hover');
  });
  bindShotLightboxSideZone(shotLightboxSideLeft);
  bindShotLightboxSideZone(shotLightboxSideRight);
  window.addEventListener('resize', () => {
    if (!shotLightboxOpen) return;
    const shot = drawerGallery.shots[drawerGallery.index];
    if (shot) applyShotLightboxSize(shot);
  }, { passive: true });
  shotLightboxClose?.addEventListener('click', closeShotLightbox);
  shotLightboxPrev?.addEventListener('click', () => goShotLightbox(drawerGallery.index - 1));
  shotLightboxNext?.addEventListener('click', () => goShotLightbox(drawerGallery.index + 1));

  function trapShotLightboxFocus(e) {
    if (!shotLightboxOpen || e.key !== 'Tab' || shotLightbox?.hidden) return;
    const focusable = shotLightbox.querySelectorAll(
      'button:not([disabled]):not([hidden]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ── YouTube-Video-Modal (z. B. Klavier spielen) ──
  const videoModal = document.getElementById('video-modal');
  const videoBackdrop = document.getElementById('video-modal-backdrop');
  const videoDialog = document.getElementById('video-modal-dialog');
  const videoTopZone = document.getElementById('video-modal-top-zone');
  const videoIframe = document.getElementById('video-modal-iframe');
  const videoTitle = document.getElementById('video-modal-title');
  let videoModalOpen = false;
  let videoLastFocus = null;

  function youtubeEmbedUrl(id) {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
  }

  function resetVideoModalHover() {
    videoModal?.classList.remove('video-modal--top-hover');
  }

  function openVideoModal(youtubeId, title) {
    if (!videoModal || !videoIframe || !youtubeId) return;

    videoLastFocus = document.activeElement;
    videoModalOpen = true;
    resetVideoModalHover();
    if (videoTitle) videoTitle.textContent = title;
    videoIframe.title = title;
    videoIframe.src = youtubeEmbedUrl(youtubeId);
    videoModal.hidden = false;
    requestAnimationFrame(() => {
      videoModal.classList.add('video-modal--open');
      lockBodyScroll();
      videoDialog?.focus({ preventScroll: true });
    });
  }

  function closeVideoModal() {
    if (!videoModalOpen || !videoModal) return;

    videoModalOpen = false;
    videoModal.classList.remove('video-modal--open');
    resetVideoModalHover();
    if (videoIframe) videoIframe.src = '';
    unlockBodyScroll();
    videoModal.hidden = true;
    videoLastFocus?.focus({ preventScroll: true });
  }

  function bindVideoTriggers() {
    document.querySelectorAll('.about__interest-video').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.querySelector('.about__interest-label')?.dataset.interestKey;
        const item = site.personalInterests?.find((i) => i.key === key);
        if (!item?.youtubeId) return;
        openVideoModal(item.youtubeId, item[locale] || item.de);
      });
    });
  }

  siteReady.then(bindVideoTriggers);

  videoBackdrop?.addEventListener('click', closeVideoModal);
  videoTopZone?.addEventListener('click', closeVideoModal);
  videoTopZone?.addEventListener('mouseenter', () => {
    videoModal?.classList.add('video-modal--top-hover');
  });
  videoTopZone?.addEventListener('mouseleave', () => {
    videoModal?.classList.remove('video-modal--top-hover');
  });

  function trapVideoModalFocus(e) {
    if (!videoModalOpen || e.key !== 'Tab' || videoModal?.hidden) return;
    const focusable = videoModal.querySelectorAll(
      'button:not([disabled]), [href], iframe, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  window.addEventListener('hashchange', handleHash);
})();
