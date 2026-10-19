import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockToolApi, PROJECT_DETAIL_ID, PROJECT_ID } from '../../helpers/tool-api.ts';
import { progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome } from '../../helpers/agent.ts';
import { answerIntake, ENDPOINT, mockNotebookState, NOTEBOOK_CONTEXT, OUTPUT, PLACEHOLDER, ROUTE, TOTAL } from './fixture.ts';

/**
 * The replay cache on this tool's screens, including the theme popup: a
 * recorded pick inside a dialog has to replay against the dialog it opened.
 *
 * Run the file twice: the first run misses (`no-entry`) and saves, the second
 * replays with no model calls. `npx e2e cache ls` lists the entries.
 */
describe(
  'notebook agent: replay cache',
  { tags: ['tools', 'notebook-agent', 'agent', 'cache'], session: 'member', agentContext: NOTEBOOK_CONTEXT, timeout: 300_000 },
  () => {
    test('a typed answer with a run-unique value still replays', async ({ app, screen, browser, agent }) => {
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await expect(screen.getByPlaceholder(PLACEHOLDER.subject)).toBeVisible({ timeout: 20_000 });
      const subject = `Cache Subject ${Date.now()}`;

      const step = await agent.act('answer the Subject with {subject}, then press Continue', { params: { subject: unique(subject) } });
      await expect(progress(screen, 1, TOTAL)).toBeVisible();
      await expect(screen.getByText(subject)).toBeVisible();
      expectCacheOutcome(step);
    });

    test('a theme picked in its popup replays through the popup', async ({ app, screen, browser, agent }) => {
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerIntake(screen, 6);

      const step = await agent.act('choose the {theme} theme in the theme popup and confirm it', { params: { theme: 'Watercolor' } });
      await expect(screen.getByRole('dialog')).toHaveCount(0);
      await expect(screen.getByRole('button', /^Watercolor/)).toBeVisible();
      await expect(screen.getByRole('button', 'Continue')).toBeEnabled();
      expectCacheOutcome(step);
    });

    test('a replayed choice ends on the screen it recorded', async ({ app, screen, browser, agent }) => {
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerIntake(screen, 4);

      const step = await agent.act('choose {language} as the notebook language', { params: { language: 'Arabic' } });
      await expect(progress(screen, 5, TOTAL)).toBeVisible();
      await expect(screen.getByText('Arabic')).toBeVisible();
      expectCacheOutcome(step);
    });

    test('a step on a saved notebook replays whatever its id', async ({ app, screen, browser, agent }) => {
      await mockNotebookState(browser);
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(`${ROUTE}?projectId=${PROJECT_ID}&projectDetailId=${PROJECT_DETAIL_ID}`);
      await expect(screen.getByText('Saved Notebook')).toBeVisible({ timeout: 20_000 });

      const step = await agent.act('start a new project');
      await expect(browser).toHaveURL(ROUTE);
      await expect(screen.getByPlaceholder(PLACEHOLDER.subject)).toHaveValue('');
      expectCacheOutcome(step);
    });
  }
);
