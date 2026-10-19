import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockSavedProject, mockToolApi } from '../../helpers/tool-api.ts';
import { progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { ENDPOINT, fromPicker, MODE, PICKER, QUIZ_OUTPUT, QUIZ_TEXT, ROUTE, WALKED_INPUTS } from './fixture.ts';

/**
 * The replay cache on this tool's screens, the game picker included: a
 * recorded pick has to replay into the questions it navigated to.
 *
 * Run the file twice: the first run misses (`no-entry`) and saves, the second
 * replays with no model calls. `npx e2e cache ls` lists the entries.
 */
describe(
  'gaming agent: replay cache',
  { tags: ['tools', 'gaming-agent', 'agent', 'cache'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('a game picked in the picker replays into its questions', async ({ app, screen, browser, agent }) => {
      await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
      await app.open(PICKER);
      await expect(screen.getByText(MODE.quiz)).toBeVisible({ timeout: 20_000 });

      const step = await agent.act('choose the {mode} game', { params: { mode: MODE.quiz } });
      await expect(browser).toHaveURL(ROUTE);
      await expect(screen.getByText('Question 1/12')).toBeVisible({ timeout: 20_000 });
      expectCacheOutcome(step);
    });

    test('a typed topic with a run-unique value still replays', async ({ app, screen, browser, agent }) => {
      await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
      await fromPicker(app, screen, browser, MODE.quiz);
      const topic = `Cache Game ${Date.now()}`;

      const step = await agent.act('answer Topic with {topic} and continue', { params: { topic: unique(topic) } });
      await expect(progress(screen, 1, 12)).toBeVisible();
      await expect(screen.getByText(topic)).toBeVisible();
      expectCacheOutcome(step);
    });

    test('a step on a saved game replays whatever its id', async ({ app, screen, browser, agent }) => {
      const projectId = 880_000 + (Date.now() % 100_000);
      await mockSavedProject(browser, projectId, QUIZ_OUTPUT, WALKED_INPUTS);
      await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
      await app.open(`${ROUTE}?projectId=${projectId}&projectName=Saved%20Game`);
      await expect(screen.getByRole('heading', new RegExp(`^${QUIZ_TEXT.title}`))).toBeVisible({ timeout: 20_000 });

      const step = await agent.act('start a new project');
      await expect(browser).toHaveURL(ROUTE);
      // Opened by link, with no picker: Game Type is one of the questions
      await expect(screen.getByText('Question 1/13')).toBeVisible();
      expectCacheOutcome(step);
    });
  }
);
