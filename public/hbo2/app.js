(() => {
  'use strict';

  // This build is backed by the existing HBO CLOUD server. The UI keeps working
  // synchronously on `cache` while every mutation is pushed to /api/*.
  const cache = { profile: {}, tasks: [], shortcuts: [], notes: [] };
  let booted = false;

  const DEFAULT_SHORTCUTS = [
    { id: 'gh', title: 'GitHub', url: 'https://github.com', letter: 'G' },
    { id: 'mdn', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', letter: 'M' },
    { id: 'chatgpt', title: 'ChatGPT', url: 'https://chatgpt.com', letter: 'C' }
  ];

  const PAGE_META = {
    home: { title: 'Home', eyebrow: 'YOUR PERSONAL WORKSPACE', description: 'A little space to focus on what matters.', icon: 'grid' },
    knowledge: { title: 'Knowledge', eyebrow: 'YOUR SECOND BRAIN', description: 'Collect what you learn. Connect what you discover.', icon: 'book' },
    lab: { title: 'My Lab', eyebrow: 'BUILD · TEST · DISCOVER', description: 'A home for your projects, experiments and technical ideas.', icon: 'code' },
    life: { title: 'My Life', eyebrow: 'MAKE SPACE FOR WHAT MATTERS', description: 'A simple place to plan your day and keep moving.', icon: 'calendar' },
    library: { title: 'Library', eyebrow: 'YOUR PERSONAL COLLECTION', description: 'Keep useful links close and your digital resources organized.', icon: 'folder' },
    cloud: { title: 'Cloud Center', eyebrow: 'YOUR INFRASTRUCTURE', description: 'A unified view of your hosted services and cloud environment.', icon: 'cloud' },
    space: { title: 'My Space', eyebrow: 'YOUR DIGITAL IDENTITY', description: 'Make this workspace feel like yours.', icon: 'spark' },
    settings: { title: 'Settings', eyebrow: 'PREFERENCES & DATA', description: 'Understand how this workspace stores your personal settings.', icon: 'settings' }
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const root = $('#hbo-app');
  const viewRoot = $('#view-root');
  const toast = $('#toast');
  let activeView = 'home';
  let toastTimer = null;
  let searchSelection = 0;
  let searchItems = [];

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    if (!response.ok) throw new Error((payload && payload.error) || `Request failed (${response.status})`);
    return payload;
  }

  function letterOf(title) {
    return String(title || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function shortcutFromLink(link) {
    return { id: link.id, title: link.title, url: link.url, letter: letterOf(link.title) };
  }

  function applyWorkspace(data) {
    cache.profile = (data && data.profile) || {};
    cache.tasks = Array.isArray(data && data.tasks) ? data.tasks : [];
    cache.shortcuts = (Array.isArray(data && data.links) ? data.links : []).map(shortcutFromLink);
    cache.notes = Array.isArray(data && data.notes) ? data.notes : [];
  }

  async function refreshWorkspace() {
    try {
      applyWorkspace(await api('/api/workspace'));
    } catch (error) {
      console.warn('HBO CLOUD could not load workspace data:', error);
      showToast('Could not reach the server. Check your connection and reload.');
    }
  }

  function getProfile() {
    const profile = cache.profile;
    return profile && typeof profile === 'object' ? profile : {};
  }

  function getTasks() {
    return Array.isArray(cache.tasks) ? cache.tasks.filter(task => task && typeof task.title === 'string') : [];
  }

  function getShortcuts() {
    if (!booted) return DEFAULT_SHORTCUTS.slice();
    return Array.isArray(cache.shortcuts)
      ? cache.shortcuts.filter(item => item && typeof item.title === 'string' && isSafeUrl(item.url))
      : [];
  }

  function getNotes() {
    return Array.isArray(cache.notes) ? cache.notes.filter(note => note && typeof note.title === 'string') : [];
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function isSafeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }

  function makeId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function icon(name) {
    const map = { grid: 'i-grid', book: 'i-book', code: 'i-code', calendar: 'i-calendar', folder: 'i-folder', cloud: 'i-cloud', spark: 'i-spark', settings: 'i-settings', check: 'i-check', plus: 'i-plus', external: 'i-external', chevron: 'i-chevron' };
    return `<svg aria-hidden="true"><use href="#${map[name] || 'i-grid'}"></use></svg>`;
  }

  function updateClock() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const greetingNode = $('#greeting-title');
    if (greetingNode && activeView === 'home') greetingNode.innerHTML = `${greeting}<span>.</span>`;
    const clock = $('#live-clock');
    if (clock) clock.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const date = $('#today-date');
    if (date) date.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const period = $('#live-period');
    if (period) period.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'LOCAL TIME';
  }

  function updateHomeStats() {
    const tasksNode = $('#stat-tasks');
    const linksNode = $('#stat-links');
    if (tasksNode) tasksNode.textContent = String(getTasks().filter(task => !task.done).length).padStart(2, '0');
    if (linksNode) linksNode.textContent = String(getShortcuts().length).padStart(2, '0');
    renderHomeShortcuts();
  }

  function renderHomeShortcuts() {
    const list = $('#shortcut-list');
    if (!list) return;
    const shortcuts = getShortcuts();
    if (!shortcuts.length) {
      list.innerHTML = '<p class="hbo-view-note">No shortcuts yet. Add a useful destination to get started.</p>';
      return;
    }
    list.innerHTML = shortcuts.slice(0, 4).map(item => `
      <a class="hbo-shortcut" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
        <span class="hbo-shortcut-icon">${escapeHtml(item.letter || item.title.slice(0, 1).toUpperCase())}</span>
        <span>${escapeHtml(item.title)}</span>${icon('external')}
      </a>`).join('');
  }

  function setActiveNavigation(page) {
    $$('.hbo-nav-item[data-view]').forEach(button => button.classList.toggle('is-active', button.dataset.view === page));
    const breadcrumb = $('#breadcrumb-current');
    if (breadcrumb) breadcrumb.textContent = PAGE_META[page]?.title || 'Home';
  }

  function renderSecondaryView(page) {
    const meta = PAGE_META[page];
    if (!meta) return;
    const pageHeader = `
      <div class="hbo-subpage-head">
        <div><div class="hbo-eyebrow"><span class="hbo-eyebrow-line"></span>${meta.eyebrow}</div><h1>${meta.title}</h1><p>${meta.description}</p></div>
      </div>`;

    const templates = {
      knowledge: `
        ${pageHeader}
        <div class="hbo-subpage-body">
          <section class="hbo-info-card"><div class="hbo-panel-heading"><div><div class="hbo-eyebrow">SERVER-SIDE NOTES</div><h2>Your knowledge base</h2></div><span class="hbo-panel-count" id="note-count-label">0 NOTES</span></div>
            <form class="hbo-task-form" id="note-form"><input class="hbo-input" id="note-title" maxlength="100" placeholder="Title" aria-label="Note title" required><input class="hbo-input" id="note-content" maxlength="2000" placeholder="Write one useful thing..." aria-label="Note content" required><button class="hbo-small-primary" type="submit">${icon('plus')} Save</button></form>
            <div id="note-list" style="margin-top:14px"></div>
            <p class="hbo-view-note">Notes live in the server's JSON store on your Railway Volume, so they survive redeploys and follow you across devices.</p>
          </section>
          <aside class="hbo-info-card"><h3>Shared with the classic panel</h3><p>These are the same notes the original HBO CLOUD page reads and writes. Nothing was migrated or duplicated.</p><ul class="hbo-info-list"><li>${icon('check')}Stored in store.json on the mounted Volume</li><li>${icon('check')}Protected by HTTP Basic Auth</li><li>${icon('check')}Atomic writes, no half-saved JSON</li></ul></aside>
        </div>`,
      lab: `
        ${pageHeader}
        <div class="hbo-subpage-body">
          <section class="hbo-info-card"><div class="hbo-panel-heading"><div><div class="hbo-eyebrow">FEATURED WORKSPACE</div><h2>Digital Universe 2.0</h2></div><span class="hbo-settings-pill">IN PROGRESS</span></div><p>A personal platform for learning, building and organizing. This is the current project that brings the HBO CLOUD spaces together.</p><div class="hbo-setting-row"><div><strong>Project direction</strong><small>Personal digital operating system</small></div><span class="hbo-settings-pill">PRODUCT</span></div><div class="hbo-setting-row"><div><strong>Current milestone</strong><small>Foundation UI and navigation</small></div><span class="hbo-settings-pill">PHASE 01</span></div></section>
          <aside class="hbo-info-card"><h3>Lab ideas</h3><ul class="hbo-info-list"><li>${icon('check')}Track small coding experiments</li><li>${icon('check')}Save reusable code snippets</li><li>${icon('check')}Document APIs and technical setups</li><li>${icon('check')}Keep a lightweight project log</li></ul></aside>
        </div>`,
      life: `
        ${pageHeader}
        <div class="hbo-subpage-body">
          <section class="hbo-info-card"><div class="hbo-panel-heading"><div><div class="hbo-eyebrow">PERSONAL TASK LIST</div><h2>Things to keep moving</h2></div><span class="hbo-panel-count" id="task-count-label">0 OPEN</span></div>
            <form class="hbo-task-form" id="task-form"><input class="hbo-input" id="new-task" maxlength="100" placeholder="Add a task for today..." aria-label="New task" required><button class="hbo-small-primary" type="submit">${icon('plus')} Add</button></form>
            <div class="hbo-task-list" id="task-list"></div>
            <p class="hbo-view-note">Tasks are stored on your Railway Volume and shared with every device you sign in from.</p>
          </section>
          <aside class="hbo-info-card"><h3>A gentle reminder</h3><p>You do not need to plan everything. Pick one useful next step, give it your attention, and keep going.</p><div class="hbo-cloud-warning">${icon('spark')}<p>Phase 02 can add calendar views, recurring tasks, habits and weekly reflections.</p></div></aside>
        </div>`,
      library: `
        ${pageHeader}
        <div class="hbo-subpage-body">
          <section class="hbo-info-card"><div class="hbo-panel-heading"><div><div class="hbo-eyebrow">PERSONAL BOOKMARKS</div><h2>Your quick links</h2></div><span class="hbo-panel-count" id="library-count">0 SAVED</span></div>
            <form class="hbo-task-form" id="shortcut-form"><input class="hbo-input" id="shortcut-title" maxlength="45" placeholder="Name (e.g. Course portal)" aria-label="Shortcut name" required><input class="hbo-input" id="shortcut-url" type="url" placeholder="https://example.com" aria-label="Shortcut URL" required><button class="hbo-small-primary" type="submit">${icon('plus')} Add</button></form>
            <div id="library-list" style="margin-top:14px"></div>
            <p class="hbo-view-note">Only HTTP and HTTPS links are accepted. Shortcuts are written to the same server store the classic panel uses, so both views stay in sync.</p>
          </section>
          <aside class="hbo-info-card"><h3>Build your own launchpad</h3><ul class="hbo-info-list"><li>${icon('check')}Course and campus portals</li><li>${icon('check')}Developer documentation</li><li>${icon('check')}Research and reference websites</li><li>${icon('check')}Tools you use every week</li></ul></aside>
        </div>`,
      cloud: `
        ${pageHeader}
        <div class="hbo-subpage-body">
          <section class="hbo-info-card"><div class="hbo-panel-heading"><div><div class="hbo-eyebrow">LIVE SERVICE DATA</div><h2>Infrastructure</h2></div><span class="hbo-panel-count" id="cloud-checked">LOADING</span></div>
            <div id="cloud-body"><div class="hbo-cloud-warning">${icon('cloud')}<p>Reading live metrics from the server...</p></div></div>
            <p class="hbo-view-note">Numbers come from the running Node process and its container, sampled when this page opens. Nothing here is mocked or cached in the browser.</p>
          </section>
          <aside class="hbo-info-card"><h3>VPN / Xray endpoints</h3><div id="cloud-vpn"><p class="hbo-view-note">Checking configured nodes...</p></div><p class="hbo-view-note">Set VPN_HEALTH_URL on Railway to enable this card: an https:// panel URL, or tcp://host:port for a raw Xray / V2Ray port. Separate several nodes with commas and prefix a label with "name|".</p></aside>
        </div>`,
      space: `
        ${pageHeader}
        <div class="hbo-subpage-body">
          <section class="hbo-info-card"><div class="hbo-panel-heading"><div><div class="hbo-eyebrow">PERSONAL IDENTITY</div><h2>Make it yours</h2></div><span class="hbo-panel-count">SERVER PROFILE</span></div>
            <form class="hbo-profile-form" id="profile-form"><div class="hbo-field"><label for="profile-name">DISPLAY NAME</label><input class="hbo-input" id="profile-name" maxlength="40" placeholder="Your name"></div><div class="hbo-field"><label for="profile-tagline">A SHORT INTRODUCTION</label><input class="hbo-input" id="profile-tagline" maxlength="100" placeholder="What are you exploring lately?"></div><button class="hbo-small-primary" type="submit">Save profile</button></form>
            <p class="hbo-view-note">Your profile is stored on the server next to your links, so it follows you to every device that opens this panel.</p>
          </section>
          <aside class="hbo-info-card"><h3>Your personal space</h3><p>This is your quiet corner of the internet: a place for your interests, projects and the things you want to remember.</p><div class="hbo-cloud-warning">${icon('spark')}<p>Future additions: custom themes, profile image, pinned widgets and a personal timeline.</p></div></aside>
        </div>`,
      settings: `
        ${pageHeader}
        <div class="hbo-subpage-body">
          <section class="hbo-info-card"><h3>Workspace preferences</h3><div class="hbo-setting-row"><div><strong>Interface language</strong><small>English</small></div><span class="hbo-settings-pill">ENGLISH</span></div><div class="hbo-setting-row"><div><strong>Appearance</strong><small>Deep navy · Midnight blue</small></div><span class="hbo-settings-pill">DARK</span></div><div class="hbo-setting-row"><div><strong>Build</strong><small>HBO CLOUD 2.0 · Phase 01</small></div><span class="hbo-settings-pill">2.0.0</span></div></section>
          <aside class="hbo-info-card"><h3>Where your data lives</h3><p>Profile, tasks, notes and shortcuts are written to <code>store.json</code> on the server, so the classic panel at <code>/</code> and this dashboard share one dataset.</p><p>On Railway that file lives on the mounted volume (DATA_DIR=/data). It survives redeploys only while the volume is attached.</p></aside>
        </div>`
    };

    viewRoot.innerHTML = `<section class="hbo-view hbo-subpage" data-page="${page}">${templates[page] || ''}</section>`;
    if (page === 'life') renderTasks();
    if (page === 'library') renderLibrary();
    if (page === 'knowledge') renderNotes();
    if (page === 'cloud') renderCloud();
    if (page === 'space') populateProfileForm();
  }

  function navigate(page) {
    if (!PAGE_META[page]) return;
    activeView = page;
    setActiveNavigation(page);
    $('#sidebar')?.classList.remove('is-open');
    if (page === 'home') {
      viewRoot.innerHTML = homeTemplate;
      updateClock();
      updateHomeStats();
    } else {
      renderSecondaryView(page);
    }
    viewRoot.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Keep the initial dashboard markup as the source of truth for returning to Home.
  const homeTemplate = viewRoot.innerHTML;

  function renderTasks() {
    const list = $('#task-list');
    if (!list) return;
    const tasks = getTasks();
    const openCount = tasks.filter(task => !task.done).length;
    const counter = $('#task-count-label');
    if (counter) counter.textContent = `${String(openCount).padStart(2, '0')} OPEN`;
    if (!tasks.length) {
      list.innerHTML = '<div class="hbo-empty-card" style="min-height:120px;margin-top:10px"><p>No tasks yet. Add one small next step above.</p></div>';
      return;
    }
    list.innerHTML = tasks.map(task => `
      <div class="hbo-task-row ${task.done ? 'is-done' : ''}" data-task-id="${escapeHtml(task.id)}">
        <button class="hbo-task-check" data-task-action="toggle" aria-label="${task.done ? 'Mark as not done' : 'Mark as done'}">${icon('check')}</button>
        <span class="hbo-task-label">${escapeHtml(task.title)}</span>
        <button class="hbo-task-delete" data-task-action="delete" aria-label="Delete task">×</button>
      </div>`).join('');
  }

  function renderLibrary() {
    const list = $('#library-list');
    if (!list) return;
    const shortcuts = getShortcuts();
    const counter = $('#library-count');
    if (counter) counter.textContent = `${String(shortcuts.length).padStart(2, '0')} SAVED`;
    if (!shortcuts.length) {
      list.innerHTML = '<div class="hbo-empty-card" style="min-height:120px"><p>Your library is empty. Add a useful website above.</p></div>';
      return;
    }
    list.innerHTML = shortcuts.map(item => `
      <div class="hbo-link-card" data-shortcut-id="${escapeHtml(item.id)}">
        <span class="hbo-shortcut-icon">${escapeHtml(item.letter || item.title.slice(0, 1).toUpperCase())}</span>
        <div class="hbo-link-card-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.url)}</small></div>
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(item.title)}">${icon('external')}</a>
        <button data-shortcut-action="delete" aria-label="Delete ${escapeHtml(item.title)}">×</button>
      </div>`).join('');
  }

  function populateProfileForm() {
    const profile = getProfile();
    const name = $('#profile-name');
    const tagline = $('#profile-tagline');
    if (name) name.value = profile.name || '';
    if (tagline) tagline.value = profile.tagline || '';
  }

  function updateProfileLabel() {
    const profile = getProfile();
    const label = $('#sidebar-user-name');
    if (label) label.textContent = profile.name || 'Your profile';
    const avatars = $$('.hbo-user-avatar');
    const initial = (profile.name || 'Y').trim().charAt(0).toUpperCase() || 'Y';
    avatars.forEach(avatar => { avatar.textContent = initial; });
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m`;
    return `${total}s`;
  }

  function vpnLabel(item) {
    if (item.status === 'online') return `${item.latencyMs} MS · ONLINE`;
    if (item.status === 'warning') return `HTTP ${item.detail.replace('HTTP ', '')} · CHECK`;
    if (item.status === 'offline') return 'OFFLINE';
    return 'UNCONFIGURED';
  }

  async function addTask(title) {
    const clean = title.trim();
    if (!clean) return false;
    try {
      const created = await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title: clean }) });
      cache.tasks = [created, ...getTasks()];
      renderTasks();
      updateHomeStats();
      showToast('Task added to your list.');
      return true;
    } catch (error) {
      showToast(error.message || 'Could not save the task.');
      return false;
    }
  }

  async function toggleTask(id) {
    const task = getTasks().find(item => item.id === id);
    if (!task) return;
    try {
      const updated = await api(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ done: !task.done }) });
      cache.tasks = getTasks().map(item => (item.id === id ? { ...item, done: Boolean(updated.done) } : item));
    } catch (error) {
      showToast(error.message || 'Could not update the task.');
    }
    renderTasks();
    updateHomeStats();
  }

  async function deleteTask(id) {
    try {
      await api(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      cache.tasks = getTasks().filter(item => item.id !== id);
      showToast('Task removed.');
    } catch (error) {
      showToast(error.message || 'Could not delete the task.');
    }
    renderTasks();
    updateHomeStats();
  }

  async function addShortcut(title, url) {
    const cleanTitle = title.trim();
    const cleanUrl = url.trim();
    if (!cleanTitle || !isSafeUrl(cleanUrl)) {
      showToast('Enter a name and a valid HTTP or HTTPS URL.');
      return false;
    }
    try {
      const created = await api('/api/links', { method: 'POST', body: JSON.stringify({ title: cleanTitle, url: cleanUrl, category: 'Library' }) });
      cache.shortcuts = [shortcutFromLink(created), ...getShortcuts()];
      renderLibrary();
      updateHomeStats();
      showToast('Shortcut saved to your library.');
      return true;
    } catch (error) {
      showToast(error.message || 'Could not save the shortcut.');
      return false;
    }
  }

  async function deleteShortcut(id) {
    try {
      await api(`/api/links/${encodeURIComponent(id)}`, { method: 'DELETE' });
      cache.shortcuts = getShortcuts().filter(item => item.id !== id);
      renderLibrary();
      updateHomeStats();
      showToast('Shortcut removed.');
    } catch (error) {
      showToast(error.message || 'Could not remove the shortcut.');
    }
  }

  async function addNote(title, content) {
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle || !cleanContent) {
      showToast('A note needs both a title and some content.');
      return false;
    }
    try {
      const created = await api('/api/notes', { method: 'POST', body: JSON.stringify({ title: cleanTitle, content: cleanContent }) });
      cache.notes = [created, ...getNotes()];
      renderNotes();
      showToast('Note saved to the server.');
      return true;
    } catch (error) {
      showToast(error.message || 'Could not save the note.');
      return false;
    }
  }

  async function deleteNote(id) {
    try {
      await api(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      cache.notes = getNotes().filter(item => item.id !== id);
      renderNotes();
      showToast('Note deleted.');
    } catch (error) {
      showToast(error.message || 'Could not delete the note.');
    }
  }

  function renderNotes() {
    const list = $('#note-list');
    if (!list) return;
    const notes = getNotes();
    const counter = $('#note-count-label');
    if (counter) counter.textContent = `${String(notes.length).padStart(2, '0')} NOTES`;
    if (!notes.length) {
      list.innerHTML = '<div class="hbo-empty-card" style="min-height:120px"><p>No notes yet. Save the first thing worth keeping above.</p></div>';
      return;
    }
    list.innerHTML = notes.map(note => `
      <div class="hbo-link-card" data-note-id="${escapeHtml(note.id)}">
        <div class="hbo-link-card-copy"><strong>${escapeHtml(note.title)}</strong><small>${escapeHtml(String(note.content).slice(0, 220))}</small></div>
        <button data-note-action="delete" aria-label="Delete ${escapeHtml(note.title)}">×</button>
      </div>`).join('');
  }

  function updateHomeCloud(data) {
    const strong = $('#stat-cloud');
    const detail = $('#stat-cloud-detail');
    const note = $('#stat-cloud-note');
    if (!strong || !data || !data.service) return;
    const results = (data.vpn && data.vpn.results) || [];
    const reachable = results.filter(item => item.status === 'online' || item.status === 'warning' || item.status === 'offline');
    const online = results.filter(item => item.status === 'online').length;
    strong.textContent = 'Online';
    if (detail) detail.textContent = `Node ${data.service.node} · ${data.service.memoryMb} MB · up ${formatDuration(data.service.uptimeSeconds)}`;
    if (note) note.innerHTML = `<i></i> ${reachable.length ? `${online}/${reachable.length} VPN NODES UP` : 'NO VPN NODE CONFIGURED'}`;
  }

  async function renderCloud() {
    const body = $('#cloud-body');
    const vpnBox = $('#cloud-vpn');
    const stamp = $('#cloud-checked');
    if (!body) return;
    try {
      const data = await api('/api/cloud');
      const s = data.service;
      const sys = data.system;
      const counts = data.counts;
      if (stamp) stamp.textContent = new Date(data.checkedAt).toLocaleTimeString();
      body.innerHTML = `
        <div class="hbo-setting-row"><div><strong>Service</strong><small>${escapeHtml(s.name)} · ${escapeHtml(s.environment)} · Node ${escapeHtml(s.node)}</small></div><span class="hbo-settings-pill">${escapeHtml(s.region)}</span></div>
        <div class="hbo-setting-row"><div><strong>Memory</strong><small>${s.memoryMb} MB RSS · ${s.heapUsedMb} MB heap</small></div><span class="hbo-settings-pill">${s.cpuPercent}% CPU</span></div>
        <div class="hbo-setting-row"><div><strong>Uptime</strong><small>Since the last deploy</small></div><span class="hbo-settings-pill">${formatDuration(s.uptimeSeconds)}</span></div>
        <div class="hbo-setting-row"><div><strong>Host</strong><small>${escapeHtml(sys.platform)} · ${sys.cpus} vCPU · ${sys.totalMemMb} MB RAM</small></div><span class="hbo-settings-pill">${sys.freeMemMb} MB FREE</span></div>
        <div class="hbo-setting-row"><div><strong>Store file</strong><small>${escapeHtml(s.dataFile)}</small></div><span class="hbo-settings-pill">${formatBytes(s.dataFileBytes)}</span></div>
        <div class="hbo-setting-row"><div><strong>Saved data</strong><small>${counts.notes} notes · ${counts.links} links · ${counts.shortlinks} short links · ${counts.tasks} tasks</small></div><span class="hbo-settings-pill">VOLUME</span></div>`;
      if (vpnBox) {
        const results = (data.vpn && data.vpn.results) || [];
        vpnBox.innerHTML = results.map(item => `
          <div class="hbo-setting-row"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.target || item.detail || '')}</small></div><span class="hbo-settings-pill">${escapeHtml(vpnLabel(item))}</span></div>`).join('')
          || '<p class="hbo-view-note">No VPN endpoint configured yet.</p>';
      }
      updateHomeCloud(data);
    } catch (error) {
      if (stamp) stamp.textContent = 'ERROR';
      body.innerHTML = `<div class="hbo-cloud-warning">${icon('cloud')}<p>${escapeHtml(error.message || 'Could not read live metrics.')}</p></div>`;
      if (vpnBox) vpnBox.innerHTML = '<p class="hbo-view-note">VPN status unavailable.</p>';
    }
  }

  function openSearch() {
    const overlay = $('#search-overlay');
    if (!overlay) return;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    $('#global-search').value = '';
    renderSearchResults('');
    window.setTimeout(() => $('#global-search')?.focus(), 30);
  }

  function closeSearch() {
    const overlay = $('#search-overlay');
    overlay?.classList.remove('is-open');
    overlay?.setAttribute('aria-hidden', 'true');
  }

  function buildSearchIndex() {
    const pages = Object.entries(PAGE_META).map(([id, meta]) => ({ kind: 'page', id, title: meta.title, detail: meta.description, icon: meta.icon }));
    const links = getShortcuts().map(item => ({ kind: 'link', id: item.id, title: item.title, detail: item.url, url: item.url, letter: item.letter }));
    const tasks = getTasks().map(item => ({ kind: 'task', id: item.id, title: item.title, detail: item.done ? 'Completed task' : 'Open task', page: 'life', icon: 'calendar' }));
    return [...pages, ...links, ...tasks];
  }

  function renderSearchResults(query) {
    const container = $('#search-results');
    if (!container) return;
    const term = query.trim().toLowerCase();
    searchItems = buildSearchIndex().filter(item => !term || `${item.title} ${item.detail}`.toLowerCase().includes(term)).slice(0, 12);
    searchSelection = 0;
    if (!searchItems.length) {
      container.innerHTML = '<div class="hbo-search-hint">NO MATCHES FOUND IN YOUR CURRENT WORKSPACE</div>';
      return;
    }
    container.innerHTML = searchItems.map((item, index) => `
      <button class="hbo-search-result ${index === 0 ? 'is-selected' : ''}" data-search-index="${index}">
        <span class="hbo-shortcut-icon">${item.kind === 'link' ? escapeHtml(item.letter || item.title.charAt(0)) : icon(item.icon || (item.kind === 'task' ? 'calendar' : 'grid'))}</span>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span>
        ${item.kind === 'link' ? icon('external') : icon('chevron')}
      </button>`).join('');
  }

  function selectSearchItem(index) {
    const item = searchItems[index];
    if (!item) return;
    closeSearch();
    if (item.kind === 'link') {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    } else {
      navigate(item.kind === 'task' ? 'life' : item.id);
    }
  }

  // Global interactions use delegation so dynamically rendered pages remain functional.
  document.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      event.preventDefault();
      navigate(viewButton.dataset.view);
      return;
    }

    const addShortcutButton = event.target.closest('#add-shortcut, #add-shortcut-row');
    if (addShortcutButton) {
      navigate('library');
      window.setTimeout(() => $('#shortcut-title')?.focus(), 50);
      return;
    }

    const taskAction = event.target.closest('[data-task-action]');
    if (taskAction) {
      const row = taskAction.closest('[data-task-id]');
      const id = row?.dataset.taskId;
      if (!id) return;
      if (taskAction.dataset.taskAction === 'toggle') toggleTask(id);
      else if (taskAction.dataset.taskAction === 'delete') deleteTask(id);
      return;
    }

    const shortcutAction = event.target.closest('[data-shortcut-action="delete"]');
    if (shortcutAction) {
      const row = shortcutAction.closest('[data-shortcut-id]');
      if (row?.dataset.shortcutId) deleteShortcut(row.dataset.shortcutId);
      return;
    }

    const noteAction = event.target.closest('[data-note-action="delete"]');
    if (noteAction) {
      const row = noteAction.closest('[data-note-id]');
      if (row?.dataset.noteId) deleteNote(row.dataset.noteId);
      return;
    }

    const searchResult = event.target.closest('[data-search-index]');
    if (searchResult) selectSearchItem(Number(searchResult.dataset.searchIndex));
  });

  document.addEventListener('submit', event => {
    if (event.target.id === 'task-form') {
      event.preventDefault();
      const input = $('#new-task');
      const form = event.target;
      addTask(input?.value || '').then(saved => {
        if (!saved) return;
        form.reset();
        input?.focus();
      });
    }
    if (event.target.id === 'shortcut-form') {
      event.preventDefault();
      const title = $('#shortcut-title');
      const url = $('#shortcut-url');
      const form = event.target;
      addShortcut(title?.value || '', url?.value || '').then(saved => {
        if (!saved) return;
        form.reset();
        title?.focus();
      });
    }
    if (event.target.id === 'note-form') {
      event.preventDefault();
      const title = $('#note-title');
      const content = $('#note-content');
      const form = event.target;
      addNote(title?.value || '', content?.value || '').then(saved => {
        if (!saved) return;
        form.reset();
        title?.focus();
      });
    }
    if (event.target.id === 'profile-form') {
      event.preventDefault();
      const profile = { name: ($('#profile-name')?.value || '').trim(), tagline: ($('#profile-tagline')?.value || '').trim() };
      api('/api/profile', { method: 'PUT', body: JSON.stringify(profile) })
        .then(saved => {
          cache.profile = { name: String(saved.name || ''), tagline: String(saved.tagline || '') };
          updateProfileLabel();
          populateProfileForm();
          showToast('Your profile has been saved on the server.');
        })
        .catch(error => showToast(error.message || 'Could not save your profile.'));
    }
  });

  $('#open-search')?.addEventListener('click', openSearch);
  $('#search-overlay')?.addEventListener('click', event => {
    if (event.target.id === 'search-overlay') closeSearch();
  });
  $('#global-search')?.addEventListener('input', event => renderSearchResults(event.target.value));
  $('#mobile-menu')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('is-open'));

  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
    if (event.key === 'Escape') {
      closeSearch();
      $('#sidebar')?.classList.remove('is-open');
    }
    if ($('#search-overlay')?.classList.contains('is-open')) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        searchSelection = (searchSelection + direction + searchItems.length) % Math.max(searchItems.length, 1);
        $$('.hbo-search-result').forEach((node, index) => node.classList.toggle('is-selected', index === searchSelection));
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        selectSearchItem(searchSelection);
      }
    }
  });

  async function bootstrap() {
    try {
      await refreshWorkspace();
    } catch (error) {
      showToast(error.message || 'Could not load your saved data.');
    }
    booted = true;
    updateClock();
    updateHomeStats();
    updateProfileLabel();
    navigate('home');
    try {
      updateHomeCloud(await api('/api/cloud'));
    } catch (error) {
      /* the home card keeps its default copy when metrics are unavailable */
    }
  }

  bootstrap();
  window.setInterval(updateClock, 15000);
})();
