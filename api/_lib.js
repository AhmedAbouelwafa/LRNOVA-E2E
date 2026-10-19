// Shared helpers for the dashboard's API routes (Vercel functions).
//
// Storage is Redis, whichever kind the Vercel project has: Upstash over its
// REST API (KV_REST_API_URL / KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN), else any Redis over REDIS_URL.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from 'redis';

export const RUN_TTL_SECONDS = 60 * 60 * 24 * 30;
const COOKIE = 'e2e_dashboard';

// ── Environment ──────────────────────────────────────────────────────────

export function env(name) {
  const value = process.env[name];
  if (!value) throw new HttpError(500, `${name} is not set on the Vercel project`);
  return value;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Wraps a handler: JSON errors, and a method check. */
export function route(methods, handler) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) throw new HttpError(405, 'method not allowed');
      res.setHeader('cache-control', 'no-store');
      await handler(req, res);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error(error);
      res.status(status).json({ error: error.message || 'server error' });
    }
  };
}

// ── Sign-in (one shared team password) ───────────────────────────────────

function sessionToken() {
  return createHmac('sha256', env('DASHBOARD_PASSWORD')).update('e2e-dashboard-session-v1').digest('hex');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(password) {
  return safeEqual(password ?? '', env('DASHBOARD_PASSWORD'));
}

export function setSessionCookie(res) {
  res.setHeader(
    'set-cookie',
    `${COOKIE}=${sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function requireUser(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie ?? '').split(';').map((part) => {
      const [k, ...v] = part.trim().split('=');
      return [k, v.join('=')];
    })
  );
  if (!cookies[COOKIE] || !safeEqual(cookies[COOKIE], sessionToken())) throw new HttpError(401, 'sign in first');
}

/** The CI job authenticates with a bearer token shared through a GitHub secret. */
export function requireCi(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !safeEqual(token, env('DASHBOARD_INGEST_TOKEN'))) throw new HttpError(401, 'bad ingest token');
}

// ── Redis ────────────────────────────────────────────────────────────────

function restConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

// One connection per function instance, reused while Vercel keeps it warm.
let tcpClient = null;
function tcp(url) {
  if (!tcpClient) {
    const client = createClient({ url, socket: { connectTimeout: 5000 } });
    client.on('error', (error) => console.error('redis:', error.message));
    tcpClient = client.connect().then(
      () => client,
      (error) => {
        tcpClient = null;
        throw new HttpError(502, `Redis: ${error.message}`);
      }
    );
  }
  return tcpClient;
}

/** Runs several Redis commands (each an array like ['GET', key]); returns each result. */
export async function redis(...commands) {
  const rest = restConfig();
  if (rest) return redisRest(rest, commands);

  const url = process.env.REDIS_URL || process.env.KV_URL;
  if (!url) throw new HttpError(500, 'Redis is not connected: add a Redis database to the Vercel project (Storage tab)');
  const client = await tcp(url);
  try {
    const results = [];
    for (const command of commands) results.push(await client.sendCommand(command.map(String)));
    return results;
  } catch (error) {
    // A dropped connection is rebuilt on the next request.
    if (!client.isReady) tcpClient = null;
    throw new HttpError(502, `Redis: ${error.message}`);
  }
}

async function redisRest({ url, token }, commands) {
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!response.ok) throw new HttpError(502, `Redis answered ${response.status}`);
  const results = await response.json();
  const failed = results.find((r) => r.error);
  if (failed) throw new HttpError(502, `Redis: ${failed.error}`);
  return results.map((r) => r.result);
}

export const keys = {
  runs: 'e2e:runs',
  run: (key) => `e2e:run:${key}`,
  spec: (key) => `e2e:run:${key}:spec`,
  events: (key) => `e2e:run:${key}:events`
};

export async function getRun(key) {
  const [raw] = await redis(['GET', keys.run(key)]);
  if (!raw) throw new HttpError(404, 'no such run');
  return JSON.parse(raw);
}

export async function saveRun(run) {
  await redis(['SET', keys.run(run.key), JSON.stringify(run), 'EX', RUN_TTL_SECONDS]);
}

// ── Environments (environments.json, bundled with the functions) ────────

/**
 * "Local" (an environment with buildApp) runs the app on the machine that runs the
 * tests: always available under `npm run dashboard:local`, and on Vercel only once
 * the CI job can build it (APP_REPO set up on GitHub) and ENABLE_LOCAL_BUILD=1 says so.
 */
export function localBuildEnabled() {
  return process.env.DASHBOARD_LOCAL === '1' || process.env.ENABLE_LOCAL_BUILD === '1';
}

export function environments() {
  const file = path.join(process.cwd(), 'environments.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}

// ── GitHub Actions ───────────────────────────────────────────────────────

export async function github(pathname, init = {}) {
  const response = await fetch(`https://api.github.com/repos/${env('GITHUB_REPO')}${pathname}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env('GITHUB_TOKEN')}`,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(502, `GitHub answered ${response.status}: ${text.slice(0, 300)}`);
  }
  return response.status === 204 ? null : response.json().catch(() => null);
}

export const WORKFLOW_FILE = process.env.GITHUB_WORKFLOW_FILE || 'e2e-dashboard.yml';

export const FINAL = new Set(['passed', 'failed', 'cancelled', 'error']);
