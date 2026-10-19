import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockSavedProject, mockToolApi } from '../../helpers/tool-api.ts';
import { answerAll, option, progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { ANSWERS_TO_MIX, ENDPOINT, INPUTS, OUTPUT, PLACEHOLDER, ROUTE, TOTAL } from './fixture.ts';

/**
 * The replay cache on this tool's screens — the same scenarios as the other
 * text tools, plus the step only this one has: the question mix.
 *
 * Run the file twice: the first run misses (`no-entry`) and saves, the second
 * replays with no model calls. `npx e2e cache ls` lists the entries.
 */
describe(
  'assessment: replay cache',
  { tags: ['tools', 'assessment', 'agent', 'cache'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('a typed answer with a run-unique value still replays', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      const topic = `Cache Quiz ${Date.now()}`;

      const step = await agent.act('answer General Topic with {topic} and continue', { params: { topic: unique(topic) } });
      await expect(progress(screen, 1, TOTAL)).toBeVisible();
      await expect(screen.getByText(topic)).toBeVisible();
      expectCacheOutcome(step);
    });

    // The add button's row count moves with every press, so the recording's end
    // state is the step after the mix appearing, not a count.
    test('adding a question-mix row replays', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS_TO_MIX, TOTAL);

      const step = await agent.act('press Add Question once');
      await expect(screen.getByPlaceholder('e.g., 5')).toHaveCount(1);
      await expect(screen.getByText(`Question ${ANSWERS_TO_MIX.length + 2}/${TOTAL}`)).toBeVisible();
      expectCacheOutcome(step);
    });

    test('a step on a saved project replays whatever its id', async ({ app, screen, browser, agent }) => {
      const projectId = 880_000 + (Date.now() % 100_000);
      await mockSavedProject(browser, projectId, OUTPUT, INPUTS);
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(`${ROUTE}?projectId=${projectId}&projectName=Saved%20Quiz`);
      await expect(screen.getByText('Saved Quiz')).toBeVisible({ timeout: 20_000 });

      const step = await agent.act('start a new project');
      await expect(browser).toHaveURL(ROUTE);
      await expect(screen.getByPlaceholder(PLACEHOLDER.topic)).toHaveValue('');
      expectCacheOutcome(step);
    });

    test('a replayed choice ends on the screen it recorded', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS_TO_MIX.slice(0, 5), TOTAL);

      const step = await agent.act('choose {difficulty} as the question difficulty', { params: { difficulty: 'Hard' } });
      await expect(progress(screen, 6, TOTAL)).toBeVisible();
      await expect(option(screen, 'Easy')).toHaveCount(0);
      expectCacheOutcome(step);
    });
  }
);
