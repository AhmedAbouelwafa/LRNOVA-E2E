// Called by the CI job: POST { key, events } — Bearer DASHBOARD_INGEST_TOKEN.
// The dashboard reporter (reporters/dashboard.ts) posts the run's progress
// here in order; scripts/ci-finish.mjs posts a last `ci-finished` event with
// the job's conclusion, which settles a run whose tests never got to report.
import { FINAL, getRun, HttpError, keys, redis, requireCi, route, RUN_TTL_SECONDS, saveRun } from './_lib.js';

function apply(run, event) {
  switch (event.type) {
    case 'run-started':
      run.status = 'running';
      run.startedAt ??= event.at;
      break;
    case 'plan':
      run.planned = event.total;
      break;
    case 'test-finished': {
      if (event.kind !== 'test') break;
      const bucket = event.status === 'passed' ? 'passed' : event.status === 'flaky' ? 'flaky' : event.status === 'skipped' ? 'skipped' : 'failed';
      run.counts[bucket] = (run.counts[bucket] ?? 0) + 1;
      break;
    }
    case 'run-error':
      run.error = event.error?.message ?? 'run error';
      break;
    case 'summary':
      run.summary = event.summary;
      break;
    case 'run-finished':
      run.status = event.exitCode === 0 ? 'passed' : event.exitCode === 1 ? 'failed' : event.exitCode === 130 ? 'cancelled' : 'error';
      run.exitCode = event.exitCode;
      run.finishedAt = event.at ?? new Date().toISOString();
      break;
    case 'ci-finished':
      if (!FINAL.has(run.status)) {
        run.status = event.conclusion === 'cancelled' ? 'cancelled' : event.conclusion === 'success' ? 'passed' : 'error';
        run.finishedAt = new Date().toISOString();
        if (run.status === 'error') run.error ??= 'The CI job failed before the tests reported (see the GitHub Actions log).';
      } else if (event.conclusion === 'cancelled') {
        run.status = 'cancelled';
      }
      break;
    default:
      break;
  }
}

export default route(['POST'], async (req, res) => {
  requireCi(req);
  const key = String(req.body?.key);
  const events = req.body?.events;
  if (!Array.isArray(events) || events.length === 0) throw new HttpError(400, 'events must be a non-empty list');

  const run = await getRun(key);
  run.counts ??= { passed: 0, failed: 0, skipped: 0, flaky: 0 };
  for (const event of events) apply(run, event);

  await redis(
    ['RPUSH', keys.events(key), ...events.map((e) => JSON.stringify(e))],
    ['EXPIRE', keys.events(key), RUN_TTL_SECONDS]
  );
  await saveRun(run);
  res.json({ ok: true });
});
