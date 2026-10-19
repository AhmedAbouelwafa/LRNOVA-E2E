// CI last step (always runs): tell the dashboard how the job ended, so a run
// whose tests never got to report (install failed, cancelled, app never came
// up) does not sit at "running" forever. Usage: node scripts/ci-finish.mjs <job.status>
const url = process.env.DASHBOARD_URL?.replace(/\/+$/, '');
const key = process.env.DASHBOARD_RUN_KEY;
const token = process.env.DASHBOARD_INGEST_TOKEN;
if (!url || !key || !token) process.exit(0);

const conclusion = process.argv[2] ?? 'failure';
try {
  const response = await fetch(`${url}/api/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ key, events: [{ type: 'ci-finished', conclusion, at: new Date().toISOString() }] })
  });
  console.log(`dashboard: ${response.status}`);
} catch (error) {
  console.log(`dashboard unreachable: ${error.message}`);
}
