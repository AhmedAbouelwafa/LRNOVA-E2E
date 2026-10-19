import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { blockVideoRenders, mockSavedProject, mockToolApi } from '../../helpers/tool-api.ts';
import { answerAll, option, progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { ANSWERS, ENDPOINT, INPUTS, OUTPUT, PLACEHOLDER, ROUTE, TOTAL, TOTAL_ARABIC } from './fixture.ts';

/**
 * The replay cache, scenario by scenario, on this tool's screens — the same
 * scenarios as the full course script's, so a recording problem in one tool
 * shows up beside the other.
 *
 * Run the file twice: the first run misses (`no-entry`) and saves, the second
 * replays with no model calls. `npx e2e cache ls` lists the entries.
 */
describe(
  'single video script: replay cache',
  { tags: ['tools', 'single-video-script', 'agent', 'cache'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('a typed answer with a run-unique value still replays', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      const topic = `Cache Video ${Date.now()}`;

      const step = await agent.act('answer Topic Area with {topic} and continue', { params: { topic: unique(topic) } });
      await expect(progress(screen, 1, TOTAL)).toBeVisible();
      await expect(screen.getByText(topic)).toBeVisible();
      expectCacheOutcome(step);
    });

    for (const [language, next, total] of [
      ['Arabic', 'Slang', TOTAL_ARABIC],
      ['English', 'Duration (Minutes)', TOTAL]
    ] as const) {
      test(`choosing ${language} keeps a recording of its own`, async ({ app, screen, agent }) => {
        await app.open(ROUTE);
        await answerAll(screen, ANSWERS.slice(0, 6), TOTAL);

        const step = await agent.act('choose {language} as the language', { params: { language } });
        await expect(progress(screen, 7, total)).toBeVisible();
        await expect(screen.getByText(next)).toBeVisible();
        expectCacheOutcome(step);
      });
    }

    test('a step on a saved project replays whatever its id', async ({ app, screen, browser, agent }) => {
      const projectId = 880_000 + (Date.now() % 100_000);
      await blockVideoRenders(browser);
      await mockSavedProject(browser, projectId, OUTPUT, INPUTS);
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(`${ROUTE}?projectId=${projectId}&projectName=Saved%20Video`);
      await expect(screen.getByText('Saved Video')).toBeVisible({ timeout: 20_000 });

      const step = await agent.act('start a new project');
      await expect(browser).toHaveURL(ROUTE);
      await expect(screen.getByPlaceholder(PLACEHOLDER.topicArea)).toHaveValue('');
      expectCacheOutcome(step);
    });

    test('a replayed choice ends on the screen it recorded', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 4), TOTAL);

      const step = await agent.act('choose {level} as the knowledge level', { params: { level: 'Advanced' } });
      await expect(progress(screen, 5, TOTAL)).toBeVisible();
      await expect(option(screen, 'Beginner')).toHaveCount(0);
      expectCacheOutcome(step);
    });
  }
);
