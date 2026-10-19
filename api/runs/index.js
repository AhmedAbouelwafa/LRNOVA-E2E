// GET  → the latest runs, newest first.
// POST → start a run: stores what to run, then dispatches the GitHub workflow.
//   body: { env, files: string[], titles: string[][], excludeAgent, label, by, testCount }
//   `files` alone runs those files whole; with `titles`, only the tests whose
//   title path is listed (each becomes an exact --grep).
import { randomUUID } from 'node:crypto';
import {
  environments,
  github,
  HttpError,
  keys,
  localBuildEnabled,
  redis,
  requireUser,
  route,
  RUN_TTL_SECONDS,
  saveRun,
  WORKFLOW_FILE,
  env as envVar
} from '../_lib.js';

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function strings(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || v.length > 500)) {
    throw new HttpError(400, `${field} must be a list of strings`);
  }
  return value;
}

export default route(['GET', 'POST'], async (req, res) => {
  requireUser(req);

  if (req.method === 'GET') {
    const [ids] = await redis(['LRANGE', keys.runs, 0, 49]);
    if (!ids?.length) return res.json({ runs: [] });
    const [raws] = await redis(['MGET', ...ids.map(keys.run)]);
    res.json({ runs: raws.filter(Boolean).map((raw) => JSON.parse(raw)) });
    return;
  }

  const body = req.body ?? {};
  const target = environments().find((e) => e.id === body.env);
  if (!target) throw new HttpError(400, 'unknown environment');
  if (target.buildApp && !localBuildEnabled()) throw new HttpError(400, `${target.label} runs only from npm run dashboard:local`);
  if (!target.buildApp && !target.url) throw new HttpError(400, `${target.label} has no URL yet (environments.json)`);

  envVar('DASHBOARD_INGEST_TOKEN'); // the CI job cannot report back without it
  const files = strings(body.files, 'files');
  const titles = Array.isArray(body.titles) ? body.titles.map((t) => strings(t, 'titles')) : [];
  if (titles.length > 600) throw new HttpError(400, 'too many tests; run their files instead');

  const key = randomUUID();
  const label = String(body.label || 'Run').slice(0, 120);
  const spec = {
    env: target.id,
    appUrl: target.buildApp ? null : target.url,
    buildApp: !!target.buildApp,
    files,
    // The runner matches --grep against the describe titles and title, joined by spaces.
    greps: titles.map((path) => `^${escapeRegExp(path.join(' '))}$`),
    excludeTags: body.excludeAgent ? ['agent'] : []
  };
  const run = {
    key,
    label,
    by: String(body.by || '').slice(0, 60),
    env: target.id,
    envLabel: target.label,
    appUrl: spec.appUrl,
    excludeAgent: !!body.excludeAgent,
    testCount: Number(body.testCount) || null,
    status: 'queued',
    createdAt: new Date().toISOString(),
    counts: { passed: 0, failed: 0, skipped: 0, flaky: 0 }
  };

  await redis(
    ['SET', keys.run(key), JSON.stringify(run), 'EX', RUN_TTL_SECONDS],
    ['SET', keys.spec(key), JSON.stringify(spec), 'EX', RUN_TTL_SECONDS],
    ['LPUSH', keys.runs, key],
    ['LTRIM', keys.runs, 0, 199]
  );

  try {
    await github(`/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({
        ref: process.env.GITHUB_REF_NAME || 'main',
        inputs: { run_key: key, label: `${target.label} · ${label}` }
      })
    });
  } catch (error) {
    await saveRun({ ...run, status: 'error', error: error.message });
    throw error;
  }

  res.status(201).json({ run });
});
