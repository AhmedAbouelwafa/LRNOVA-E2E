import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockSavedProject, mockToolApi } from '../../helpers/tool-api.ts';
import { answerAll, option, progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { ANSWERS, ENDPOINT, INPUTS, OUTPUT, PLACEHOLDER, ROUTE, TOTAL } from './fixture.ts';

/**
 * The replay cache on this tool's screens, plus the case its long type list
 * raises: an option behind View more takes two taps, and both must replay.
 *
 * Run the file twice: the first run misses (`no-entry`) and saves, the second
 * replays with no model calls. `npx e2e cache ls` lists the entries.
 */
describe(
  'activity generator: replay cache',
  { tags: ['tools', 'activity-generator', 'agent', 'cache'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('a typed answer with a run-unique value still replays', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      const topic = `Cache Activity ${Date.now()}`;

      const step = await agent.act('answer Activity Topic with {topic} and continue', { params: { topic: unique(topic) } });
      await expect(progress(screen, 1, TOTAL)).toBeVisible();
      await expect(screen.getByText(topic)).toBeVisible();
      expectCacheOutcome(step);
    });

    test('an option behind View more replays both taps', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 2), TOTAL);

      const step = await agent.act('choose {type} as the activity type', { params: { type: 'Case Studies' } });
      await expect(progress(screen, 3, TOTAL)).toBeVisible();
      await expect(option(screen, 'Ice Breakers')).toHaveCount(0);
      expectCacheOutcome(step);
    });

    test('a step on a saved project replays whatever its id', async ({ app, screen, browser, agent }) => {
      const projectId = 880_000 + (Date.now() % 100_000);
      await mockSavedProject(browser, projectId, OUTPUT, INPUTS);
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(`${ROUTE}?projectId=${projectId}&projectName=Saved%20Activity`);
      await expect(screen.getByText('Saved Activity')).toBeVisible({ timeout: 20_000 });

      const step = await agent.act('start a new project');
      await expect(browser).toHaveURL(ROUTE);
      await expect(screen.getByPlaceholder(PLACEHOLDER.activityTopic)).toHaveValue('');
      expectCacheOutcome(step);
    });
  }
);
