// The dashboard on this machine, for trying it before (or instead of) Vercel:
//
//   npm run dashboard:local      → http://localhost:4321   password: local
//
// Same page (public/) and same API (api/). Redis is kept in memory, and the
// Run button starts the tests here — with the very scripts the GitHub job runs
// (ci-spec → ci-run → ci-finish) — instead of on GitHub Actions. Runs go one at
// a time; the terminal shows each run's output too. PORT and DASHBOARD_PASSWORD
// override the defaults. Ctrl+C stops the server and any run in progress.
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
process.chdir(ROOT);

const PORT = Number(process.env.PORT || 4321);
const BASE = `http://localhost:${PORT}`;
const PASSWORD = process.env.DASHBOARD_PASSWORD || 'local';
const TOKEN = randomUUID();
const jobEnv = { ...process.env }; // what the test runs see: the user's own environment

Object.assign(process.env, {
  DASHBOARD_PASSWORD: PASSWORD,
  DASHBOARD_INGEST_TOKEN: TOKEN,
  KV_REST_API_URL: 'http://memory.redis',
  KV_REST_API_TOKEN: 'local',
  GITHUB_REPO: 'local/local',
  GITHUB_TOKEN: 'local'
});

// ── The test list, fresh ─────────────────────────────────────────────────

const built = spawnSync(process.execPath, ['scripts/build-catalog.mjs'], { stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);

// ── Redis, in memory ─────────────────────────────────────────────────────

const db = new Map();
const range = (list, start, stop) => {
  stop = Number(stop);
  if (stop < 0) stop = list.length + stop;
  return list.slice(Number(start), stop + 1);
};
function redis([command, ...a]) {
  switch (command.toUpperCase()) {
    case 'GET': return db.get(a[0]) ?? null;
    case 'SET': db.set(a[0], a[1]); return 'OK';
    case 'MGET': return a.map((k) => db.get(k) ?? null);
    case 'LPUSH': { const l = db.get(a[0]) ?? []; for (const v of a.slice(1)) l.unshift(v); db.set(a[0], l); return l.length; }
    case 'RPUSH': { const l = db.get(a[0]) ?? []; l.push(...a.slice(1)); db.set(a[0], l); return l.length; }
    case 'LTRIM': db.set(a[0], range(db.get(a[0]) ?? [], a[1], a[2])); return 'OK';
    case 'LRANGE': return range(db.get(a[0]) ?? [], a[1], a[2]);
    case 'LLEN': return (db.get(a[0]) ?? []).length;
    case 'EXPIRE': return 1;
    default: throw new Error(`dashboard-local: Redis command ${command} is not emulated`);
  }
}

// ── "GitHub Actions": a queue of local runs ──────────────────────────────

const queue = [];
let active = null;
let jobNumber = 0;

function step(job, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...jobEnv, DASHBOARD_URL: BASE, DASHBOARD_RUN_KEY: job.key, DASHBOARD_INGEST_TOKEN: TOKEN, GITHUB_RUN_ID: job.id }
    });
    job.child = child;
    child.on('error', () => resolve(1));
    child.on('exit', (code) => {
      job.child = null;
      resolve(code ?? 1);
    });
  });
}

async function work() {
  if (active || !queue.length) return;
  const job = (active = queue.shift());
  console.log(`\n── run ${job.id} (${job.label}) ──`);
  let code = await step(job, ['scripts/ci-spec.mjs']);
  if (code === 0 && !job.cancelled) code = await step(job, ['scripts/ci-run.mjs']);
  const conclusion = job.cancelled ? 'cancelled' : code === 0 ? 'success' : 'failure';
  await step(job, ['scripts/ci-finish.mjs', conclusion]);
  console.log(`── run ${job.id} ${conclusion} ──\n`);
  active = null;
  work();
}

function kill(job) {
  job.cancelled = true;
  if (!job.child) return;
  // The run's whole tree: the runner, its workers and the browser.
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(job.child.pid), '/T', '/F'], { stdio: 'ignore' });
  else job.child.kill('SIGTERM');
}

function fakeGitHub(url, init) {
  const { pathname } = new URL(url);
  if (pathname.endsWith('/dispatches')) {
    const { inputs } = JSON.parse(init.body);
    queue.push({ key: inputs.run_key, label: inputs.label, id: `local-${++jobNumber}` });
    setImmediate(work);
    return new Response(null, { status: 204 });
  }
  const cancel = pathname.match(/\/actions\/runs\/([^/]+)\/cancel$/);
  if (cancel) {
    const job = active?.id === cancel[1] ? active : queue.find((j) => j.id === cancel[1]);
    if (job) kill(job);
    return new Response(null, { status: 202 });
  }
  return Response.json({ message: 'not emulated' }, { status: 404 });
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith('http://memory.redis')) return Response.json(JSON.parse(init.body).map((c) => ({ result: redis(c) })));
  if (u.startsWith('https://api.github.com/')) return fakeGitHub(u, init);
  return realFetch(url, init);
};

// ── The page and the API, the way Vercel serves them ─────────────────────

const handler = (file) => import(pathToFileURL(path.join(ROOT, 'api', file)).href).then((m) => m.default);
const routes = [
  [/^\/api\/session$/, await handler('session.js')],
  [/^\/api\/runs$/, await handler('runs/index.js')],
  [/^\/api\/runs\/([^/]+)$/, await handler('runs/[key].js'), (m) => ({ key: decodeURIComponent(m[1]) })],
  [/^\/api\/cancel$/, await handler('cancel.js')],
  [/^\/api\/ci-spec$/, await handler('ci-spec.js')],
  [/^\/api\/ingest$/, await handler('ingest.js')]
];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };

  for (const [pattern, handle, params] of routes) {
    const match = url.pathname.match(pattern);
    if (!match) continue;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    try {
      req.body = raw ? JSON.parse(raw) : undefined;
    } catch {
      return res.status(400).json({ error: 'invalid JSON' });
    }
    req.query = { ...Object.fromEntries(url.searchParams), ...(params ? params(match) : {}) };
    return handle(req, res);
  }

  const file = path.join(ROOT, 'public', url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(ROOT, 'public')) || !existsSync(file) || statSync(file).isDirectory()) {
    res.statusCode = 404;
    return res.end('not found');
  }
  res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
});

server.listen(PORT, () => {
  console.log(`\nE2E dashboard (local) → ${BASE}`);
  console.log(`Password: ${PASSWORD}`);
  console.log('Runs start on this machine, one at a time. Ctrl+C to stop.\n');
});

process.on('SIGINT', () => {
  if (active) kill(active);
  process.exit(130);
});
