import { existsSync } from 'node:fs';
import path from 'node:path';
import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { dashboardReporter } from './reporters/dashboard.ts';

// The runner loads no .env itself; OPENROUTER_API_KEY lives there (git-ignored).
const envFile = path.join(import.meta.dirname, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// The Angular app under test lives beside this folder; CI checks it out
// elsewhere and says where with APP_DIR.
const appDir = process.env.APP_DIR
  ? path.resolve(process.env.APP_DIR)
  : path.resolve(import.meta.dirname, '../UserDashboard/UserDashboard');

const appUrl = process.env.APP_URL ?? 'http://localhost:4200';
// A deployed environment (dev, staging, prod) is already running: nothing to start.
const isDeployed = !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(appUrl);

export default {
  // `list` in the terminal; the dashboard reporter streams to the test
  // dashboard only when the CI job configures it.
  reporters: ['list', dashboardReporter],
  // OpenRouter reads OPENROUTER_API_KEY. A `:free` model costs no credits;
  // it must support tool calls. This one is text-only: the agent reads the
  // page's accessibility tree, so `vision: true` judgments are unavailable.
  agents: {
    default: {
      model: openrouter('nvidia/nemotron-3-super-120b-a12b:free'),
      system: 'You are a thorough QA agent. Verify every outcome.',
    },
  },
  // A dev account (the app's development build talks to dev-api.lrnova.ai).
  // The password comes from E2E_USER_MEMBER_PASSWORD in .env, never from code;
  // CI can swap the account per environment with E2E_USER_MEMBER_USERNAME.
  credentials: {
    member: {
      username: process.env.E2E_USER_MEMBER_USERNAME || 'ali@gmail.com',
      password: () => process.env.E2E_USER_MEMBER_PASSWORD ?? '',
    },
  },
  targets: [{
    engine: web(),
    app: {
      url: appUrl,
      // Same as `npm start` in the app folder, run through node because the
      // runner spawns without a shell (npm.cmd / ng.cmd would not resolve on Windows).
      command: isDeployed ? undefined : {
        executable: 'node',
        args: ['node_modules/@angular/cli/bin/ng.js', 'serve', '--configuration', 'development', '--port', '{port}'],
        cwd: appDir,
        // The first Angular build of this app takes a while.
        startupTimeout: 300_000,
        log: '.e2e/logs/app.log',
        // Attach to an already-running `npm start` instead of failing.
        reuseExisting: true,
      },
    },
  }],
} satisfies E2EConfig;
