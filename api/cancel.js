// POST { key } → stop a run: cancels its GitHub Actions run, or, if the job
// has not started yet, marks it cancelled so the job stops when it does.
import { FINAL, getRun, github, requireUser, route, saveRun } from './_lib.js';

export default route(['POST'], async (req, res) => {
  requireUser(req);
  const run = await getRun(String(req.body?.key));
  if (FINAL.has(run.status)) return res.json({ run });

  if (run.ghRunId) {
    await github(`/actions/runs/${run.ghRunId}/cancel`, { method: 'POST' });
    run.cancelRequested = true;
  } else {
    run.status = 'cancelled';
    run.finishedAt = new Date().toISOString();
  }
  await saveRun(run);
  res.json({ run });
});
