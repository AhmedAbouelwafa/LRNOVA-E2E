// GET    /api/runs/:key?after=N → the run and its events from index N on.
//        The page polls this while a run is live and replays the events into its view.
// DELETE /api/runs/:key         → delete the run (cancelling it first if it is still going).
import { deleteRuns, getRun, keys, redis, requireUser, route } from '../_lib.js';

const PAGE = 2000;

export default route(['GET', 'DELETE'], async (req, res) => {
  requireUser(req);
  const key = String(req.query.key);

  if (req.method === 'DELETE') {
    await deleteRuns([key]);
    res.json({ deleted: [key] });
    return;
  }

  const after = Math.max(0, Number(req.query.after) || 0);
  const run = await getRun(key);
  const [events, length] = await redis(['LRANGE', keys.events(key), after, after + PAGE - 1], ['LLEN', keys.events(key)]);
  res.json({
    run,
    events: (events ?? []).map((raw) => JSON.parse(raw)),
    next: after + (events?.length ?? 0),
    total: length ?? 0
  });
});
