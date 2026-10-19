import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockSavedProject, mockToolApi } from '../../helpers/tool-api.ts';
import { answerAll, option, progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { ANSWERS, COURSE, ENDPOINT, OUTPUT, PLACEHOLDER, ROUTE, TOTAL, TOTAL_ARABIC } from './fixture.ts';

/**
 * The replay cache, scenario by scenario, on this tool's screens.
 *
 * Every step here is checked twice: by the locator matcher that pins its
 * outcome (which is what lets the cache record it), and by
 * `expectCacheOutcome`, which holds the step to the cache's own rules
 * whichever way this run went. Run the file twice: the first run misses
 * (`no-entry`) and saves, the second replays with no model calls.
 *
 *   npx e2e run tests/tools/full-course-script/caching.e2e.ts   # records
 *   npx e2e run tests/tools/full-course-script/caching.e2e.ts   # replays
 *   npx e2e cache ls                                            # the entries
 */
describe(
  'full course script: replay cache',
  { tags: ['tools', 'full-course-script', 'agent', 'cache'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    // A value that changes every run would key a new entry every run. Wrapped
    // in unique(), the recording keeps one key and replays the new value.
    test('a typed answer with a run-unique value still replays', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      const title = `Cache Course ${Date.now()}`;

      const step = await agent.act('answer Course Title with {title} and continue', { params: { title: unique(title) } });
      await expect(progress(screen, 1, TOTAL)).toBeVisible();
      await expect(screen.getByText(title)).toBeVisible();
      expectCacheOutcome(step);
    });

    // A choice that changes what comes next is an ordinary param: each value
    // is its own entry, and neither replay can stand in for the other.
    for (const [language, next, total] of [
      ['Arabic', 'Slang', TOTAL_ARABIC],
      ['English', 'Number of Modules', TOTAL]
    ] as const) {
      test(`choosing ${language} keeps a recording of its own`, async ({ app, screen, agent }) => {
        await app.open(ROUTE);
        await answerAll(screen, ANSWERS.slice(0, 6), TOTAL);

        const step = await agent.act('choose {language} as the language', { params: { language } });
        await expect(progress(screen, 7, total)).toBeVisible();
        await expect(screen.getByText(`Question 8/${total}`)).toBeVisible();
        await expect(screen.getByText(next)).toBeVisible();
        expectCacheOutcome(step);
      });
    }

    // A replay has to start on the route it was recorded on. Ids in the query
    // are read as placeholders, so a project opened under a different id each
    // run is still the recorded screen.
    test('a step on a saved project replays whatever its id', async ({ app, screen, browser, agent }) => {
      const projectId = 880_000 + (Date.now() % 100_000);
      await mockSavedProject(browser, projectId, OUTPUT, { courseTitle: COURSE.title, language: 'English' });
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(`${ROUTE}?projectId=${projectId}&projectName=Saved%20Course`);
      await expect(screen.getByText('Saved Course')).toBeVisible({ timeout: 20_000 });

      const step = await agent.act('start a new project');
      await expect(browser).toHaveURL(ROUTE);
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.courseTitle)).toHaveValue('');
      expectCacheOutcome(step);
    });

    // A step that only looks — no tap, no typing — changes nothing a replay
    // could check, so it is never written: it misses on every run, which is
    // what keeps a judgment like this one honest.
    test('a step that changes nothing is never recorded', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible({ timeout: 20_000 });

      const step = await agent.act('read which question is being asked now, without changing anything');
      await expect(screen.getByPlaceholder(PLACEHOLDER.courseTitle)).toHaveValue('');
      if (step.cache) {
        expect(step.cache.mode).toBe('missed');
      }
    });

    // The live check that follows a replay is what proves the replay landed:
    // the option list closing and the counter moving are the recorded end state.
    test('a replayed choice ends on the screen it recorded', async ({ app, screen, agent }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 4), TOTAL);

      const step = await agent.act('choose {level} as the knowledge level', { params: { level: 'Advanced' } });
      await expect(progress(screen, 5, TOTAL)).toBeVisible();
      await expect(screen.getByText('Advanced')).toBeVisible();
      await expect(option(screen, 'Beginner')).toHaveCount(0);
      expectCacheOutcome(step);
    });
  }
);
