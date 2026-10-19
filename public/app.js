// LRNOVA E2E dashboard: pick tests, start a run on GitHub Actions through the
// API, and watch it live — every test and every step as the runner reports it.
// No framework: the page re-renders its panels from plain state.

const FINAL = new Set(['passed', 'failed', 'cancelled', 'error']);
const POLL_MS = 2000;

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const store = {
  get(key, fallback = null) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: preferences just don't stick */
    }
  }
};

const state = {
  catalog: null,
  localBuild: false,
  tests: [],
  byFile: new Map(),
  groups: [],
  selected: new Set(),
  open: new Set(),
  search: '',
  runs: [],
  runsTimer: null,
  current: null,
  runFilter: 'all',
  expandedTests: new Set(),
  openTraces: new Set()
};

// ── Helpers ──────────────────────────────────────────────────────────────

async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== 'session') {
    showLogin();
    throw new Error('Please sign in again.');
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast${isError ? ' toast--error' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), isError ? 7000 : 3500);
}

function duration(ms) {
  if (ms == null || Number.isNaN(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
}

function ago(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleString();
}

const pretty = (slug) => slug.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
const testName = (t) => (t.titlePath.length > 1 ? t.titlePath.slice(1).join(' › ') : t.titlePath[0]);
const fileName = (file) => file.split('/').pop().replace(/\.e2e\.ts$/, '');
const statusLabel = (s) =>
  ({ queued: 'Queued', starting: 'Starting', running: 'Running', passed: 'Passed', failed: 'Failed', flaky: 'Flaky', skipped: 'Skipped', cancelled: 'Cancelled', error: 'Error', 'timed-out': 'Timed out', blocked: 'Blocked' })[s] ?? s;
const pill = (s) => `<span class="status status--${esc(s)}">${esc(statusLabel(s))}</span>`;

// ── Sign-in ──────────────────────────────────────────────────────────────

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  stopPolling();
  $('#login-password').focus();
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = $('#login-error');
  error.hidden = true;
  try {
    const session = await api('session', { method: 'POST', body: JSON.stringify({ password: $('#login-password').value }) });
    state.localBuild = !!session.localBuild;
    $('#login-password').value = '';
    await startApp();
  } catch (e) {
    error.textContent = e.message;
    error.hidden = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('session', { method: 'DELETE' }).catch(() => {});
  showLogin();
});

// ── Theme ────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
applyTheme(store.get('theme'));
$('#theme').addEventListener('click', () => {
  const dark =
    document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  store.set('theme', next);
});

// ── Catalog & environment ────────────────────────────────────────────────

async function loadCatalog() {
  const response = await fetch('catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('catalog.json is missing — the Vercel build did not run scripts/build-catalog.mjs');
  const catalog = await response.json();
  // "Local" is offered only where it can run (npm run dashboard:local, or ENABLE_LOCAL_BUILD on Vercel).
  catalog.environments = catalog.environments.filter((e) => !e.buildApp || state.localBuild);
  state.catalog = catalog;
  state.tests = catalog.tests.filter((t) => !t.skipped);
  state.byFile = new Map();
  for (const t of state.tests) {
    if (!state.byFile.has(t.file)) state.byFile.set(t.file, []);
    state.byFile.get(t.file).push(t);
  }

  // Groups: auth, smoke, and one per tool under tests/tools.
  const groups = new Map();
  for (const file of state.byFile.keys()) {
    const parts = file.split('/');
    const id = parts[1] === 'tools' ? `tools/${parts[2]}` : parts[1];
    const label = parts[1] === 'tools' ? `Tools · ${pretty(parts[2])}` : pretty(parts[1]);
    if (!groups.has(id)) groups.set(id, { id, label, files: [] });
    groups.get(id).files.push(file);
  }
  state.groups = [...groups.values()].sort((a, b) => (a.id.startsWith('tools') - b.id.startsWith('tools')) || a.label.localeCompare(b.label));

  $('#catalog-meta').textContent = `${state.tests.length} tests in ${state.byFile.size} files · ${state.tests.filter((t) => t.usesAgent).length} use the AI agent · list built ${ago(catalog.builtAt)}`;

  const select = $('#env');
  select.innerHTML = catalog.environments
    .map((e) => {
      const ready = e.buildApp || e.url;
      return `<option value="${esc(e.id)}" ${ready ? '' : 'disabled'}>${esc(e.label)}${ready ? '' : ' (no URL yet)'}</option>`;
    })
    .join('');
  const saved = store.get('env');
  const firstReady = catalog.environments.find((e) => e.buildApp || e.url);
  const savedEnv = catalog.environments.find((e) => e.id === saved && (e.buildApp || e.url));
  select.value = (savedEnv ?? firstReady)?.id ?? '';
  updateEnvTitle();
}

function currentEnv() {
  return state.catalog?.environments.find((e) => e.id === $('#env').value);
}

function updateEnvTitle() {
  const e = currentEnv();
  $('#env').title = e ? `${e.description ?? ''}${e.url ? `\n${e.url}` : ''}` : '';
}

$('#env').addEventListener('change', () => {
  store.set('env', $('#env').value);
  updateEnvTitle();
});
$('#skip-agent').checked = store.get('skipAgent') === '1';
$('#skip-agent').addEventListener('change', () => store.set('skipAgent', $('#skip-agent').checked ? '1' : '0'));
$('#by').value = store.get('by', '');
$('#by').addEventListener('change', () => store.set('by', $('#by').value.trim()));

// ── Test tree ────────────────────────────────────────────────────────────

const matches = (t) => {
  if (!state.search) return true;
  const q = state.search.toLowerCase();
  return t.titlePath.join(' ').toLowerCase().includes(q) || t.file.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q));
};

function checkState(tests) {
  const n = tests.filter((t) => state.selected.has(t.id)).length;
  return n === 0 ? 'none' : n === tests.length ? 'all' : 'some';
}

/** The status a test has in the run being viewed, if it has run there. */
function runStatusOf(test) {
  const model = state.current?.model;
  if (!model) return null;
  const hit = model.byName.get(`${test.file}|${test.titlePath.join('|')}`) ?? model.byName.get(`${test.file}|leaf:${test.titlePath.at(-1)}`);
  return hit?.status ?? null;
}

function renderTree() {
  const searching = !!state.search;
  const rows = [];
  for (const group of state.groups) {
    const groupTests = group.files.flatMap((f) => state.byFile.get(f)).filter(matches);
    if (!groupTests.length) continue;
    const groupOpen = searching || state.open.has(group.id);
    rows.push(nodeRow({
      kind: 'group',
      id: group.id,
      label: esc(group.label),
      count: groupTests.length,
      open: groupOpen,
      check: checkState(groupTests)
    }));
    if (!groupOpen) continue;
    for (const file of group.files) {
      const fileTests = state.byFile.get(file).filter(matches);
      if (!fileTests.length) continue;
      const fileOpen = searching || state.open.has(file);
      rows.push(nodeRow({
        kind: 'file',
        id: file,
        label: `${esc(fileName(file))}`,
        title: file,
        count: fileTests.length,
        open: fileOpen,
        check: checkState(fileTests)
      }));
      if (!fileOpen) continue;
      for (const t of fileTests) {
        const status = runStatusOf(t);
        rows.push(nodeRow({
          kind: 'test',
          id: t.id,
          label: `${status ? `<span class="dot dot--${esc(status)}" title="${esc(statusLabel(status))} in the open run"></span> ` : ''}${esc(testName(t))}${t.usesAgent ? '<span class="tag" title="Uses the AI agent">AI</span>' : ''}`,
          title: `${t.file}:${t.line}`,
          check: state.selected.has(t.id) ? 'all' : 'none'
        }));
      }
    }
  }
  $('#tree').innerHTML = rows.join('') || '<div class="empty">No tests match.</div>';
  for (const box of document.querySelectorAll('#tree input[data-some]')) box.indeterminate = true;

  const n = state.selected.size;
  $('#run-selected').disabled = n === 0;
  $('#run-selected').textContent = n ? `Run selected (${n})` : 'Run selected';
}

function nodeRow({ kind, id, label, title = '', count, open, check }) {
  const toggle =
    kind === 'test'
      ? ''
      : `<button class="node__toggle ${open ? 'is-open' : ''}" data-toggle="${esc(id)}" type="button" aria-label="${open ? 'Collapse' : 'Expand'}">▶</button>`;
  return `<div class="node node--${kind}" role="treeitem" ${kind === 'test' ? '' : `aria-expanded="${open}"`}>
    ${toggle}
    <input class="node__check" type="checkbox" data-kind="${kind}" data-id="${esc(id)}" ${check === 'all' ? 'checked' : ''} ${check === 'some' ? 'data-some' : ''} aria-label="Select" />
    <span class="node__label" title="${esc(title)}">${label}</span>
    ${count != null ? `<span class="node__count">${count}</span>` : ''}
    <button class="node__run" data-run-kind="${kind}" data-run-id="${esc(id)}" type="button">▶ Run</button>
  </div>`;
}

function testsOf(kind, id) {
  if (kind === 'group') return state.groups.find((g) => g.id === id).files.flatMap((f) => state.byFile.get(f));
  if (kind === 'file') return state.byFile.get(id);
  return state.tests.filter((t) => t.id === id);
}

$('#tree').addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) {
    const id = toggle.dataset.toggle;
    state.open.has(id) ? state.open.delete(id) : state.open.add(id);
    renderTree();
    return;
  }
  const run = event.target.closest('[data-run-kind]');
  if (run) {
    const { runKind, runId } = run.dataset;
    const tests = testsOf(runKind, runId);
    const label =
      runKind === 'group'
        ? state.groups.find((g) => g.id === runId).label
        : runKind === 'file'
          ? fileName(runId)
          : testName(tests[0]);
    startRun(tests, label);
  }
});

$('#tree').addEventListener('change', (event) => {
  const box = event.target.closest('.node__check');
  if (!box) return;
  const tests = testsOf(box.dataset.kind, box.dataset.id).filter(matches);
  for (const t of tests) box.checked ? state.selected.add(t.id) : state.selected.delete(t.id);
  renderTree();
});

$('#search').addEventListener('input', () => {
  state.search = $('#search').value.trim();
  renderTree();
});
$('#select-none').addEventListener('click', () => {
  state.selected.clear();
  renderTree();
});
$('#expand-all').addEventListener('click', () => {
  const allOpen = state.groups.every((g) => state.open.has(g.id));
  if (allOpen) state.open.clear();
  else for (const g of state.groups) {
    state.open.add(g.id);
    for (const f of g.files) state.open.add(f);
  }
  $('#expand-all').textContent = allOpen ? 'Expand all' : 'Collapse all';
  renderTree();
});
$('#run-all').addEventListener('click', () => startRun(state.tests, 'All tests'));
$('#run-selected').addEventListener('click', () => {
  const tests = state.tests.filter((t) => state.selected.has(t.id));
  startRun(tests, tests.length === 1 ? testName(tests[0]) : `${tests.length} selected tests`);
});

// ── Starting a run ───────────────────────────────────────────────────────

/** What to send for these tests: whole files when possible, else exact titles. */
function selectionFor(tests) {
  if (tests.length === state.tests.length) return { files: [], titles: [] };
  const byFile = new Map();
  for (const t of tests) {
    if (!byFile.has(t.file)) byFile.set(t.file, []);
    byFile.get(t.file).push(t);
  }
  const wholeFiles = [...byFile].every(([file, list]) => list.length === state.byFile.get(file).length);
  return { files: [...byFile.keys()], titles: wholeFiles ? [] : tests.map((t) => t.titlePath) };
}

async function startRun(tests, label) {
  const env = currentEnv();
  if (!env) return toast('Pick an environment first.', true);
  const excludeAgent = $('#skip-agent').checked;
  const count = excludeAgent ? tests.filter((t) => !t.usesAgent).length : tests.length;
  if (!count) return toast('Every test here uses the AI agent — turn off "Skip AI-agent tests" to run them.', true);
  if (env.confirm && !confirm(`Run ${count} test${count === 1 ? '' : 's'} against ${env.label} (${env.url})?\n\n${env.description ?? ''}`)) return;

  try {
    const { run } = await api('runs', {
      method: 'POST',
      body: JSON.stringify({ env: env.id, ...selectionFor(tests), excludeAgent, label, by: $('#by').value.trim(), testCount: count })
    });
    toast(`Started: ${label} — GitHub Actions is picking it up.`);
    location.hash = `run=${run.key}`;
  } catch (e) {
    toast(e.message, true);
  }
}

// ── Runs list ────────────────────────────────────────────────────────────

async function loadRuns() {
  try {
    const { runs } = await api('runs');
    state.runs = runs;
    renderRuns();
  } catch (e) {
    $('#runs').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
  clearTimeout(state.runsTimer);
  if (!state.current && state.runs.some((r) => !FINAL.has(r.status))) state.runsTimer = setTimeout(loadRuns, 4000);
}

function runCountsLine(run) {
  const c = run.counts ?? {};
  const parts = [];
  if (c.passed) parts.push(`${c.passed} passed`);
  if (c.failed) parts.push(`${c.failed} failed`);
  if (c.flaky) parts.push(`${c.flaky} flaky`);
  if (c.skipped) parts.push(`${c.skipped} skipped`);
  return parts.join(' · ');
}

function renderRuns() {
  if (!state.runs.length) {
    $('#runs').innerHTML = '<div class="empty">No runs yet. Pick tests on the left and press Run.</div>';
    return;
  }
  $('#runs').innerHTML = state.runs
    .map(
      (run) => `<button class="run-card" data-key="${esc(run.key)}" type="button">
        <span class="run-card__title">${esc(run.label)}</span>
        ${pill(run.status)}
        <span class="run-card__meta">
          <span>${esc(run.envLabel)}</span>
          ${run.excludeAgent ? '<span>no AI tests</span>' : ''}
          ${run.by ? `<span>by ${esc(run.by)}</span>` : ''}
          <span>${esc(ago(run.createdAt))}</span>
          ${runCountsLine(run) ? `<span>${esc(runCountsLine(run))}</span>` : ''}
        </span>
      </button>`
    )
    .join('');
}

$('#runs').addEventListener('click', (event) => {
  const card = event.target.closest('.run-card');
  if (card) location.hash = `run=${card.dataset.key}`;
});
$('#refresh-runs').addEventListener('click', loadRuns);

// ── One run: replaying its events ────────────────────────────────────────

function newModel() {
  return { tests: new Map(), order: [], byName: new Map(), setup: new Map(), notices: [], planned: null, finished: null, runError: null, summary: null, ci: null };
}

function ensureTest(model, testId, seed = {}) {
  let t = model.tests.get(testId);
  if (!t) {
    t = { testId, file: seed.file ?? '', title: seed.title ?? '', titlePath: seed.titlePath ?? null, status: 'running', steps: [], stepIndex: new Map(), kind: 'test' };
    model.tests.set(testId, t);
    model.order.push(testId);
  }
  return t;
}

function indexName(model, t) {
  if (t.titlePath) model.byName.set(`${t.file}|${t.titlePath.join('|')}`, t);
  const leaf = t.titlePath?.at(-1) ?? t.title;
  if (leaf) model.byName.set(`${t.file}|leaf:${leaf}`, t);
}

function applyEvent(model, e) {
  switch (e.type) {
    case 'setup': {
      const s = model.setup.get(e.label) ?? { label: e.label };
      s.state = e.state;
      s.durationMs = e.durationMs;
      model.setup.set(e.label, s);
      break;
    }
    case 'notice':
      model.notices.push(e.message);
      break;
    case 'plan':
      model.planned = e.total;
      break;
    case 'test-started': {
      const t = ensureTest(model, e.testId, e);
      t.status = 'running';
      t.file ||= e.file;
      t.title ||= e.title;
      indexName(model, t);
      break;
    }
    case 'step': {
      const t = ensureTest(model, e.testId);
      const key = `${e.attempt ?? 0}:${e.stepId ?? `${e.api}:${e.label}`}`;
      let step = t.stepIndex.get(key);
      if (!step) {
        step = { key, attempt: e.attempt ?? 0, api: e.api, label: e.label, kind: e.kind, status: 'running' };
        t.stepIndex.set(key, step);
        t.steps.push(step);
      }
      if (e.phase === 'end') Object.assign(step, { status: e.status, durationMs: e.durationMs, error: e.error, explanation: e.explanation, modelCalls: e.modelCalls });
      break;
    }
    case 'test-finished': {
      const t = ensureTest(model, e.testId, e);
      Object.assign(t, { status: e.status, titlePath: e.titlePath, file: e.file, kind: e.kind, durationMs: e.durationMs, error: e.error, attempts: e.attempts });
      // A step the runner never closed (the test failed inside it) ends with the test.
      for (const step of t.steps) if (step.status === 'running') step.status = e.status === 'passed' ? 'passed' : 'cancelled';
      indexName(model, t);
      break;
    }
    case 'trace':
      ensureTest(model, e.testId).trace = e.text;
      break;
    case 'run-error':
      model.runError = e.error?.message ?? 'The run stopped with an error.';
      break;
    case 'run-stopped':
      model.notices.push(`Stopped after ${e.failures} failures (limit ${e.limit}).`);
      break;
    case 'run-finished':
      model.finished = e;
      break;
    case 'summary':
      model.summary = e.summary;
      break;
    case 'ci-finished':
      model.ci = e.conclusion;
      break;
    default:
      break;
  }
}

function stopPolling() {
  if (state.current?.timer) clearTimeout(state.current.timer);
  clearTimeout(state.runsTimer);
}

async function openRun(key) {
  stopPolling();
  state.current = { key, run: null, model: newModel(), next: 0, finalAt: null, timer: null };
  state.expandedTests.clear();
  state.openTraces.clear();
  $('#runs-view').hidden = true;
  $('#run-view').hidden = false;
  $('.layout').classList.add('is-run');
  $('#run-summary').innerHTML = '<div class="empty">Loading run…</div>';
  $('#run-tests').innerHTML = '';
  $('#run-setup').innerHTML = '';
  await poll(state.current);
}

async function poll(current) {
  try {
    let more = true;
    while (more) {
      const data = await api(`runs/${encodeURIComponent(current.key)}?after=${current.next}`);
      if (state.current !== current) return;
      current.run = data.run;
      for (const event of data.events) applyEvent(current.model, event);
      current.next = data.next;
      more = data.events.length > 0 && data.next < data.total;
    }
    renderRun();
    renderTree();
  } catch (e) {
    if (state.current !== current) return;
    $('#run-summary').innerHTML = `<div class="banner">${esc(e.message)}</div>`;
    return;
  }

  // Keep listening a little after the run ends: the traces and the job's end arrive last.
  const final = FINAL.has(current.run.status);
  if (final && !current.finalAt) current.finalAt = Date.now();
  const settled = final && (current.model.ci || Date.now() - current.finalAt > 120_000);
  if (!settled) current.timer = setTimeout(() => poll(current), POLL_MS);
}

function modelCounts(model) {
  const c = { passed: 0, failed: 0, flaky: 0, skipped: 0, running: 0 };
  for (const t of model.tests.values()) {
    if (t.kind === 'setup') continue;
    if (t.status === 'running') c.running++;
    else if (t.status === 'passed') c.passed++;
    else if (t.status === 'flaky') c.flaky++;
    else if (t.status === 'skipped') c.skipped++;
    else c.failed++;
  }
  return c;
}

function renderRun() {
  const { run, model } = state.current;
  const c = modelCounts(model);
  const done = c.passed + c.failed + c.flaky + c.skipped;
  const total = Math.max(model.planned ? model.planned - [...model.tests.values()].filter((t) => t.kind === 'setup').length : run.testCount ?? 0, done + c.running);
  const pct = (n) => (total ? (n / total) * 100 : 0);
  const end = run.finishedAt ? new Date(run.finishedAt) : new Date();
  const elapsed = run.startedAt ? end - new Date(run.startedAt) : null;

  let banner = '';
  if (run.status === 'queued') banner = '<div class="banner banner--info">Waiting for GitHub Actions to pick up the job…</div>';
  else if (run.status === 'starting') banner = '<div class="banner banner--info">The job is installing the browser and preparing the tests — usually one to three minutes before the first test starts.</div>';
  if (run.cancelRequested && !FINAL.has(run.status)) banner = '<div class="banner banner--info">Cancelling…</div>';
  if (run.error || model.runError) banner += `<div class="banner">${esc(model.runError ?? run.error)}</div>`;
  if (model.notices.length) banner += model.notices.map((n) => `<div class="banner banner--info">${esc(n)}</div>`).join('');

  $('#run-summary').innerHTML = `<div class="summary">
    <div class="summary__top">
      <h3 class="summary__title">${esc(run.label)}</h3>
      ${pill(run.status)}
    </div>
    <div class="summary__meta">
      <span>Environment: <strong>${esc(run.envLabel)}</strong>${run.appUrl ? ` · ${esc(run.appUrl)}` : ''}</span>
      ${run.excludeAgent ? '<span>AI-agent tests skipped</span>' : ''}
      ${run.by ? `<span>By ${esc(run.by)}</span>` : ''}
      <span>Started ${esc(ago(run.createdAt))}</span>
      ${elapsed != null ? `<span>Duration ${esc(duration(elapsed))}</span>` : ''}
    </div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" title="${done} of ${total} done">
      <span class="progress__pass" style="width:${pct(c.passed)}%"></span>
      <span class="progress__other" style="width:${pct(c.flaky + c.skipped)}%"></span>
      <span class="progress__fail" style="width:${pct(c.failed)}%"></span>
    </div>
    <div class="counts">
      <div class="count"><span class="count__n">${done}/${total || '–'}</span><span class="count__label">Done</span></div>
      <div class="count count--pass"><span class="count__n">${c.passed}</span><span class="count__label">Passed</span></div>
      <div class="count count--fail"><span class="count__n">${c.failed}</span><span class="count__label">Failed</span></div>
      <div class="count"><span class="count__n">${c.flaky + c.skipped}</span><span class="count__label">Flaky / skipped</span></div>
      <div class="count"><span class="count__n">${c.running}</span><span class="count__label">Running now</span></div>
    </div>
    ${banner}
  </div>`;

  const failedTests = [...model.tests.values()].filter((t) => t.kind !== 'setup' && t.titlePath && !['passed', 'running', 'skipped', 'flaky'].includes(t.status));
  $('#run-links').innerHTML = [
    run.ghUrl ? `<a class="link" href="${esc(run.ghUrl)}" target="_blank" rel="noopener">GitHub Actions log ↗</a>` : '',
    run.ghUrl && FINAL.has(run.status) ? `<a class="link" href="${esc(run.ghUrl)}#artifacts" target="_blank" rel="noopener">Download results ↗</a>` : '',
    FINAL.has(run.status) && failedTests.length ? `<button class="btn btn--sm" id="rerun-failed" type="button">Re-run ${failedTests.length} failed</button>` : '',
    !FINAL.has(run.status) && !run.cancelRequested ? '<button class="btn btn--sm btn--danger" id="cancel-run" type="button">Cancel run</button>' : ''
  ].join('');

  $('#run-setup').innerHTML = [...model.setup.values()]
    .map((s) => `<span class="setup-chip"><span class="dot dot--${s.state === 'finished' ? 'passed' : 'running'}"></span>${esc(s.label)}${s.durationMs != null ? ` · ${esc(duration(s.durationMs))}` : ''}</span>`)
    .join('');

  renderRunTests();
}

function renderRunTests() {
  const { model } = state.current;
  const filter = state.runFilter;
  const list = model.order
    .map((id) => model.tests.get(id))
    .filter((t) => {
      if (filter === 'all') return true;
      if (filter === 'failed') return !['passed', 'running', 'skipped', 'flaky'].includes(t.status);
      if (filter === 'running') return t.status === 'running';
      return t.status === 'passed' || t.status === 'flaky';
    });

  if (!list.length) {
    const run = state.current.run;
    $('#run-tests').innerHTML = `<div class="empty">${
      model.order.length ? 'No tests in this view.' : FINAL.has(run.status) ? 'No test reported in this run.' : 'Tests appear here as soon as they start.'
    }</div>`;
    return;
  }

  $('#run-tests').innerHTML = list
    .map((t) => {
      const open = state.expandedTests.has(t.testId);
      const name = t.titlePath ? (t.titlePath.length > 1 ? t.titlePath.slice(1).join(' › ') : t.titlePath[0]) : t.title;
      const time = t.durationMs != null ? duration(t.durationMs) : t.steps.length ? `${t.steps.filter((s) => s.status !== 'running').length}/${t.steps.length} steps` : '';
      return `<div class="rt ${t.status === 'failed' || t.status === 'timed-out' ? 'rt--failed' : ''}">
        <button class="rt__head" data-test="${esc(t.testId)}" type="button" aria-expanded="${open}">
          <span class="dot dot--${esc(t.status)}"></span>
          <span class="rt__title">
            <span class="rt__name">${esc(name)}</span>${t.kind === 'setup' ? '<span class="tag">setup</span>' : ''}
            <span class="rt__file">${esc(t.file)}</span>
          </span>
          <span class="rt__time">${esc(time)}</span>
          ${pill(t.status)}
        </button>
        ${open ? renderTestBody(t) : ''}
      </div>`;
    })
    .join('');
}

function renderTestBody(t) {
  const parts = [];
  if (t.error?.message) parts.push(`<div class="rt__error">${esc(t.error.code ? `${t.error.code}: ` : '')}${esc(t.error.message)}</div>`);
  if (!t.steps.length) parts.push(`<p class="muted small">${t.status === 'running' ? 'Starting…' : 'No steps were reported.'}</p>`);

  let attempt = -1;
  let items = [];
  const flush = () => {
    if (items.length) parts.push(`<ol class="steps">${items.join('')}</ol>`);
    items = [];
  };
  for (const s of t.steps) {
    if (s.attempt !== attempt) {
      flush();
      if (s.attempt > 0) parts.push(`<p class="attempt">Retry ${s.attempt}</p>`);
      attempt = s.attempt;
    }
    const notes = [];
    if (s.explanation) notes.push(`<span class="step__note">${esc(s.explanation)}</span>`);
    if (s.error?.message) notes.push(`<span class="step__note step__note--error">${esc(s.error.message)}</span>`);
    items.push(`<li class="step">
      <span class="dot dot--${esc(s.status)}" title="${esc(statusLabel(s.status))}"></span>
      <span class="step__label"><span class="step__api">${esc(s.api)}</span>${esc(s.label)}${s.modelCalls ? ` <span class="tag" title="Model calls">AI ×${s.modelCalls}</span>` : ''}</span>
      <span class="step__time">${s.status === 'running' ? 'running…' : esc(duration(s.durationMs))}</span>
      ${notes.join('')}
    </li>`);
  }
  flush();

  if (t.trace) {
    parts.push(`<details class="trace" data-trace="${esc(t.testId)}" ${state.openTraces.has(t.testId) ? 'open' : ''}>
      <summary>Full trace — steps, app log and the screen at failure</summary>
      <pre>${esc(t.trace)}</pre>
    </details>`);
  }
  return `<div class="rt__body">${parts.join('')}</div>`;
}

$('#run-tests').addEventListener('click', (event) => {
  const head = event.target.closest('[data-test]');
  if (!head) return;
  const id = head.dataset.test;
  state.expandedTests.has(id) ? state.expandedTests.delete(id) : state.expandedTests.add(id);
  renderRunTests();
});

$('#run-tests').addEventListener(
  'toggle',
  (event) => {
    const details = event.target.closest?.('[data-trace]');
    if (!details) return;
    details.open ? state.openTraces.add(details.dataset.trace) : state.openTraces.delete(details.dataset.trace);
  },
  true
);

$('#run-filter').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-filter]');
  if (!tab) return;
  state.runFilter = tab.dataset.filter;
  for (const el of document.querySelectorAll('#run-filter .tab')) el.classList.toggle('is-active', el === tab);
  renderRunTests();
});

$('#run-links').addEventListener('click', async (event) => {
  if (event.target.id === 'cancel-run') {
    if (!confirm('Cancel this run?')) return;
    try {
      const { run } = await api('cancel', { method: 'POST', body: JSON.stringify({ key: state.current.key }) });
      state.current.run = run;
      renderRun();
      if (!state.current.timer) poll(state.current);
    } catch (e) {
      toast(e.message, true);
    }
  }
  if (event.target.id === 'rerun-failed') {
    const { model, run } = state.current;
    const failed = [...model.tests.values()].filter((t) => t.kind !== 'setup' && t.titlePath && !['passed', 'running', 'skipped', 'flaky'].includes(t.status));
    const tests = failed
      .map((f) => state.tests.find((t) => t.file === f.file && t.titlePath.join('|') === f.titlePath.join('|')))
      .filter(Boolean);
    if (!tests.length) return toast('These tests are no longer in the list.', true);
    $('#env').value = run.env;
    startRun(tests, `Re-run failed: ${run.label}`);
  }
});

$('#back').addEventListener('click', () => (location.hash = ''));

// ── Routing & start ──────────────────────────────────────────────────────

function route() {
  const key = new URLSearchParams(location.hash.slice(1)).get('run');
  if (key) {
    openRun(key);
  } else {
    stopPolling();
    state.current = null;
    $('#run-view').hidden = true;
    $('#runs-view').hidden = false;
    $('.layout').classList.remove('is-run');
    renderTree();
    loadRuns();
  }
}

window.addEventListener('hashchange', route);

async function startApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  try {
    await loadCatalog();
  } catch (e) {
    toast(e.message, true);
  }
  renderTree();
  route();
}

(async () => {
  try {
    const { signedIn, localBuild } = await api('session');
    state.localBuild = !!localBuild;
    signedIn ? await startApp() : showLogin();
  } catch (e) {
    showLogin();
    const error = $('#login-error');
    error.textContent = e.message;
    error.hidden = false;
  }
})();
