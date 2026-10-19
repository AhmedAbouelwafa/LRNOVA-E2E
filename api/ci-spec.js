// Called by the GitHub Actions job when it starts (scripts/ci-spec.mjs):
// POST { key, ghRunId, ghUrl } → records which Actions run this is and
// returns what to run. Bearer DASHBOARD_INGEST_TOKEN.
import { getRun, HttpError, keys, redis, requireCi, route, saveRun } from './_lib.js';

export default route(['POST'], async (req, res) => {
  requireCi(req);
  const key = String(req.body?.key);
  const run = await getRun(key);
  if (run.status === 'cancelled') throw new HttpError(409, 'run was cancelled before it started');

  const [raw] = await redis(['GET', keys.spec(key)]);
  if (!raw) throw new HttpError(404, 'run has no spec');

  run.ghRunId = req.body?.ghRunId ?? run.ghRunId;
  run.ghUrl = req.body?.ghUrl ?? run.ghUrl;
  run.status = 'starting';
  await saveRun(run);
  res.json(JSON.parse(raw));
});
