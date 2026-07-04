(() => {
  const drawer = document.getElementById('project-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const closeBtn = document.getElementById('drawer-close');
  const filterCount = document.getElementById('filter-count');
  const cards = document.querySelectorAll('.card');
  const filterChips = document.querySelectorAll('.filter-chip, .stack-pill');
  const openButtons = document.querySelectorAll('[data-open]');

  let projects = {};
  let activeFilter = 'all';
  let activeSlug = null;
  let lastFocus = null;

  document.querySelectorAll('.card').forEach((card, i) => {
    card.style.setProperty('--i', i);
  });

  async function loadProjects() {
    const res = await fetch('/projects.json');
    const data = await res.json();
    for (const section of data.sections) {
      for (const p of section.projects) {
        projects[p.slug] = p;
      }
    }
    handleHash();
  }

  function setFilter(filter) {
    activeFilter = filter;
    let visible = 0;

    document.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.classList.toggle('filter-chip--active', chip.dataset.filter === filter);
    });

    document.querySelectorAll('.stack-pill').forEach((pill) => {
      pill.classList.toggle('stack-pill--active', filter !== 'all' && pill.dataset.filter === filter);
    });

    cards.forEach((card) => {
      const stacks = (card.dataset.stack || '').split(',');
      const show = filter === 'all' || stacks.includes(filter);
      card.classList.toggle('card--hidden', !show);
      if (show) visible++;
    });

    document.querySelectorAll('.section').forEach((section) => {
      const sectionCards = section.querySelectorAll('.card:not(.card--hidden)');
      section.classList.toggle('section--empty', sectionCards.length === 0);
    });

    const label =
      filter === 'all'
        ? `${visible} Projekte`
        : `${visible} von ${cards.length} Projekten`;
    if (filterCount) filterCount.textContent = label;

    if (filter !== 'all') {
      document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderDrawerMedia(project) {
    const media = document.getElementById('drawer-media');
    const shot = `/screenshots/${project.slug}.png`;
    media.style.setProperty('--accent', project.accent);
    media.innerHTML = `<img src="${shot}" alt="Screenshot von ${esc(project.name)}" onerror="this.parentElement.classList.add('drawer__media--fallback');this.remove()" />`;
    media.classList.remove('drawer__media--fallback');
  }

  function renderDrawer(project) {
    document.getElementById('drawer-title').textContent = project.name;
    document.getElementById('drawer-desc').textContent = project.longDescription || project.description;

    const highlights = document.getElementById('drawer-highlights');
    highlights.innerHTML = (project.highlights || [])
      .map((h) => `<li>${esc(h)}</li>`)
      .join('');
    highlights.hidden = !project.highlights?.length;

    const stackEl = document.getElementById('drawer-stack');
    stackEl.innerHTML = `
      <h3 class="drawer__stack-title">Tech-Stack</h3>
      <div class="drawer__tags">${project.stack.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`;

    const actions = document.getElementById('drawer-actions');
    actions.innerHTML = `
      <a class="btn btn--primary" href="${esc(project.url)}" target="_blank" rel="noopener noreferrer">
        Live ansehen <span aria-hidden="true">↗</span>
      </a>
      ${project.github ? `<a class="btn btn--ghost" href="${esc(project.github)}" target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        GitHub
      </a>` : ''}`;

    renderDrawerMedia(project);
    drawer.style.setProperty('--accent', project.accent);
  }

  function openDrawer(slug) {
    const project = projects[slug];
    if (!project) return;

    lastFocus = document.activeElement;
    activeSlug = slug;
    renderDrawer(project);

    drawer.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      drawer.classList.add('drawer--open');
      backdrop.classList.add('drawer-backdrop--visible');
    });

    document.body.classList.add('drawer-open');
    openButtons.forEach((btn) => {
      btn.setAttribute('aria-expanded', btn.dataset.open === slug ? 'true' : 'false');
    });

    history.replaceState(null, '', `#${slug}`);
    closeBtn.focus();
  }

  function closeDrawer() {
    drawer.classList.remove('drawer--open');
    backdrop.classList.remove('drawer-backdrop--visible');

    const onEnd = () => {
      drawer.hidden = true;
      backdrop.hidden = true;
      drawer.removeEventListener('transitionend', onEnd);
    };
    drawer.addEventListener('transitionend', onEnd);

    document.body.classList.remove('drawer-open');
    activeSlug = null;
    openButtons.forEach((btn) => btn.setAttribute('aria-expanded', 'false'));

    if (location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }

    lastFocus?.focus();
  }

  function handleHash() {
    const slug = location.hash.slice(1);
    if (slug && projects[slug]) {
      openDrawer(slug);
    }
  }

  function esc(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  openButtons.forEach((btn) => {
    btn.addEventListener('click', () => openDrawer(btn.dataset.open));
  });

  closeBtn.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeSlug) closeDrawer();
  });

  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => setFilter(chip.dataset.filter));
  });

  window.addEventListener('hashchange', handleHash);

  loadProjects();
})();
