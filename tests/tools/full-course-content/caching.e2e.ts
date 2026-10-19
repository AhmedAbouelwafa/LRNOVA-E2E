import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockSavedProject, mockToolApi } from '../../helpers/tool-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { ANSWERS, ENDPOINT, INPUTS, OUTPUT, PLACEHOLDER, ROUTE, TOTAL } from './fixture.ts';

/**
 * The replay cache on this tool's screens, plus the case only a slider raises:
 * a typed value from the params is what the replay must set again.
 *
 * Run the file twice: the first run misses (`no-entry`) and saves, the second
 * replays with no model calls. `npx e2e cache ls` lists the entries.
 */
describe(
  'full course content: replay cache',
  { tags: ['tools', 'full-course-content', 'agent', 'cache'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('a typed answer with a run-unique value still replays', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      const title = `Cache Course ${Date.now()}`;

      const step = await agent.act('answer Course Title with {title} and continue', { params: { title: unique(title) } });
      await expect(progress(screen, 1, TOTAL)).toBeVisible();
      await expect(screen.getByText(title)).toBeVisible();
      expectCacheOutcome(step);
    });

    test('setting Course Hours replays its value', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 8), TOTAL);

      const step = await agent.act('set Course Hours to {hours} and continue', { params: { hours: '24' } });
      await expect(progress(screen, 9, TOTAL)).toBeVisible();
      await expect(screen.getByText('24')).toBeVisible();
      expectCacheOutcome(step);
    });

    test('a step on a saved project replays whatever its id', async ({ app, screen, browser, agent }) => {
      const projectId = 880_000 + (Date.now() % 100_000);
      await mockSavedProject(browser, projectId, OUTPUT, INPUTS);
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(`${ROUTE}?projectId=${projectId}&projectName=Saved%20Course`);
      await expect(screen.getByText('Saved Course')).toBeVisible({ timeout: 20_000 });

      const step = await agent.act('start a new project');
      await expect(browser).toHaveURL(ROUTE);
      await expect(screen.getByPlaceholder(PLACEHOLDER.courseTitle)).toHaveValue('');
      expectCacheOutcome(step);
    });
  }
);
