// CI step 2: run the selection in .e2e-spec.json with `npx e2e run`, against the
// environment's URL (or the app the job built, when APP_URL is left unset).
// The dashboard reporter in e2e.config.ts streams the progress.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const spec = JSON.parse(readFileSync('.e2e-spec.json', 'utf8'));

// The installed e2e CLI, run through node: no shell, so it works the same on
// Linux CI and on Windows (scripts/dashboard-local.mjs).
const e2eDir = path.join(process.cwd(), 'node_modules', 'e2e');
const cli = path.join(e2eDir, JSON.parse(readFileSync(path.join(e2eDir, 'package.json'), 'utf8')).bin.e2e);

const args = ['run', ...spec.files];
for (const pattern of spec.greps ?? []) args.push('--grep', pattern);
for (const tag of spec.excludeTags ?? []) args.push('--exclude-tag', tag);
args.push('--trace', 'retain-on-failure');

const env = { ...process.env };
if (spec.appUrl) env.APP_URL = spec.appUrl;
else delete env.APP_URL;

// The environment's own test account when it has one (E2E_USER_MEMBER_*_PROD …), else the default.
const suffix = String(spec.env).toUpperCase();
for (const name of ['E2E_USER_MEMBER_USERNAME', 'E2E_USER_MEMBER_PASSWORD']) {
  const own = process.env[`${name}_${suffix}`];
  if (own) env[name] = own;
}
// Never the password itself — only enough to tell an unset or truncated secret.
const password = env.E2E_USER_MEMBER_PASSWORD ?? '';
console.log(
  `account: ${env.E2E_USER_MEMBER_USERNAME || 'ali@gmail.com (default)'} · password ${password ? `set, ${password.length} characters` : 'NOT SET'}` +
    `${process.env[`E2E_USER_MEMBER_PASSWORD_${suffix}`] ? ` (from E2E_USER_MEMBER_PASSWORD_${suffix})` : ''}`
);
if (!password) console.log('::warning::E2E_USER_MEMBER_PASSWORD is empty — add it under Settings → Secrets and variables → Actions.');

console.log(`npx e2e ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
const child = spawn(process.execPath, [cli, ...args], { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 130 : 1)));
