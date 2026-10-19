// CI step 1: tell the dashboard this Actions run has started, and fetch what
// to run. Writes .e2e-spec.json for ci-run.mjs and step outputs for the workflow.
import { appendFileSync, writeFileSync } from 'node:fs';

const url = process.env.DASHBOARD_URL?.replace(/\/+$/, '');
const key = process.env.DASHBOARD_RUN_KEY;
const token = process.env.DASHBOARD_INGEST_TOKEN;
if (!url || !key || !token) {
  console.error('DASHBOARD_URL (repository variable), DASHBOARD_INGEST_TOKEN (secret) and the run_key input are required.');
  process.exit(2);
}

const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
const response = await fetch(`${url}/api/ci-spec`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    key,
    ghRunId: GITHUB_RUN_ID,
    ghUrl: GITHUB_SERVER_URL && GITHUB_REPOSITORY ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : undefined
  })
});
if (!response.ok) {
  console.error(`The dashboard refused the run: ${response.status} ${await response.text()}`);
  process.exit(1);
}

const spec = await response.json();

// "Local build" checks the app out of its own repository: say so plainly if that is not set up.
if (spec.buildApp && !process.env.APP_REPO) {
  const message =
    'The "Local build" environment needs the app repository: add the repository variable APP_REPO (owner/name) and the secret APP_REPO_TOKEN on GitHub — or pick Dev, Staging or Production.';
  console.error(message);
  await fetch(`${url}/api/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ key, events: [{ type: 'run-error', at: new Date().toISOString(), error: { code: 'APP_REPO_MISSING', message } }] })
  }).catch(() => {});
  process.exit(1);
}

writeFileSync('.e2e-spec.json', JSON.stringify(spec, null, 2));
console.log(JSON.stringify(spec, null, 2));

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `env=${spec.env}\nenv_upper=${String(spec.env).toUpperCase()}\nbuild_app=${spec.buildApp ? 'true' : 'false'}\n`
  );
}
