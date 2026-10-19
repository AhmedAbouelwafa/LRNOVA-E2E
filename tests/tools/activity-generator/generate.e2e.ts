import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockSavedProject, mockToolApi, mockToolFailure, PROJECT_ID, type MockOptions } from '../../helpers/tool-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { ACTIVITY, ANSWERS, ENDPOINT, INPUTS, OUTPUT, OUTPUT_AR, PLACEHOLDER, ROUTE, TOOL_ID, TOOL_NAME, TOOL_NAME_AR, TOTAL } from './fixture.ts';

const DEFAULT_TITLE = `Untitled - ${TOOL_NAME}`;

/** Answers every question and generates against the stubbed API. */
async function generate(app: App, screen: Screen, browser: Browser, output: unknown = OUTPUT, options?: MockOptions) {
  const api = await mockToolApi(browser, ENDPOINT, output, options);
  await app.open(ROUTE);
  await answerAll(screen, ANSWERS, TOTAL);
  await screen.getByRole('button', 'Generate').tap();
  if (!options?.hold) {
    await expect(screen.getByText(OUTPUT.activity.caseStudy)).toBeVisible({ timeout: 20_000 });
  }
  return api;
}

/** Icon-only toolbar buttons with no accessible name, found by class. */
function toolbarButton(browser: Browser, name: 'copy' | 'edit') {
  return browser.locator(`button.tool-${name}-button`);
}

describe(
  'activity generator: generate',
  { tags: ['tools', 'activity-generator'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('answering every question generates the activity, every section shown', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await expect(screen.getByRole('heading', 'Listening Pairs')).toBeVisible();
      for (const section of ['Materials Needed', 'Preparation', 'Steps', 'Expected Outcomes', 'Evaluation', 'Adaptations', 'Safety Notes', 'Case Study']) {
        await expect(screen.getByRole('heading', section)).toBeVisible();
      }
      await expect(screen.getByText('Question cards')).toBeVisible();
      await expect(screen.getByText('Swap roles')).toBeVisible();
      await expect(screen.getByText(DEFAULT_TITLE)).toBeVisible();

      expect(api.runs).toHaveLength(1);
      expect(api.runs[0].toolId).toBe(TOOL_ID);
      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, referenceLink: '' });
    });

    test('a section the activity left empty is not shown', async ({ app, screen, browser }) => {
      await generate(app, screen, browser, { ...OUTPUT, activity: { ...OUTPUT.activity, safetyNotes: [] } });

      await expect(screen.getByRole('heading', 'Case Study')).toBeVisible();
      await expect(screen.getByRole('heading', 'Safety Notes')).toHaveCount(0);
    });

    test('the loader holds the canvas until the activity arrives', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser, OUTPUT, { hold: true });

      await expect(browser.locator('app-content-loader')).toBeVisible({ timeout: 10_000 });
      api.release();
      await expect(screen.getByRole('heading', 'Listening Pairs')).toBeVisible({ timeout: 20_000 });
    });

    test('edits to the activity are saved, the rest untouched', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await toolbarButton(browser, 'edit').tap();
      await screen.getByPlaceholder(PLACEHOLDER.title).fill('Listening Pairs, Timed');
      await screen.getByPlaceholder(PLACEHOLDER.objective).fill('Hear the question, then answer within a minute.');
      await screen.getByRole('button', 'Save').tap();

      await expect(screen.getByRole('heading', 'Listening Pairs, Timed')).toBeVisible({ timeout: 20_000 });
      expect(api.updates).toHaveLength(1);
      expect(api.updates[0].output).toMatchObject({
        direction: 'ltr',
        activity: {
          title: 'Listening Pairs, Timed',
          objective: 'Hear the question, then answer within a minute.',
          steps: OUTPUT.activity.steps,
          caseStudy: OUTPUT.activity.caseStudy
        }
      });
    });

    test('saving an edit to an Arabic activity keeps it right to left', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser, OUTPUT_AR);

      await toolbarButton(browser, 'edit').tap();
      await screen.getByPlaceholder(PLACEHOLDER.title).fill('ثنائيات الاستماع المؤقتة');
      await screen.getByRole('button', 'Save').tap();

      await expect(screen.getByRole('heading', 'ثنائيات الاستماع المؤقتة')).toBeVisible({ timeout: 20_000 });
      expect(api.updates[0].output).toMatchObject({ direction: 'rtl' });
    });

    test('cancelling an edit keeps the activity as it was', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await toolbarButton(browser, 'edit').tap();
      await screen.getByPlaceholder(PLACEHOLDER.title).fill('A draft nobody saved');
      await screen.getByRole('button', 'Cancel').tap();

      await expect(screen.getByRole('heading', 'Listening Pairs')).toBeVisible();
      await expect(screen.getByText('A draft nobody saved')).toHaveCount(0);
      expect(api.updates).toHaveLength(0);
    });

    // Beside the document the inputs open on their last question, not at the
    // first optional one left empty (which hid Regenerate until skipped again).
    test('Regenerate is in reach beside the activity and runs the same answers again', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await expect(screen.getByRole('button', 'Regenerate')).toBeVisible();
      await screen.getByRole('button', 'Regenerate').tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
      expect(api.runs[1].inputs).toMatchObject(INPUTS);
    });

    test('the agent starts a new project from a finished activity', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      await generate(app, screen, browser);

      await agent.act('start a new project');
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.activityTopic)).toHaveValue('');
    });

    test('New Project returns to a blank questionnaire', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'New Project').tap();
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.activityTopic)).toHaveValue('');
      await expect(browser).toHaveURL(ROUTE);
    });

    test('renaming the project saves the new title', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);
      const title = 'Listening Workshop';

      await screen.getByText(DEFAULT_TITLE).tap();
      await screen.getByDisplayValue(DEFAULT_TITLE).fill(title);
      await screen.getByDisplayValue(title).press('Enter');

      await expect(screen.getByText(title)).toBeVisible();
      expect(api.renames).toEqual([{ projectId: PROJECT_ID, name: title }]);
    });

    test('Export downloads the activity as a Word file', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'Export').tap();
      await expect(screen.getByText('Production Script (PDF)')).toBeVisible();
      await screen.getByText('Curriculum Outline (DOCX)').tap();

      const download = await browser.waitForDownload(() => screen.getByRole('button', 'Start Exporting').tap());
      expect(download.suggestedFilename).toBe(`${DEFAULT_TITLE}.docx`);
    });

    test('an Arabic activity is not offered as PDF', async ({ app, screen, browser }) => {
      await generate(app, screen, browser, OUTPUT_AR);

      await screen.getByRole('button', 'Export').tap();
      await expect(screen.getByText('Curriculum Outline (DOCX)')).toBeVisible();
      await expect(screen.getByText('Production Script (PDF)')).toHaveCount(0);
    });

    test('Copy all content confirms the copy', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await toolbarButton(browser, 'copy').tap();
      await expect(screen.getByText('✓ Content copied to clipboard!')).toBeVisible();
    });

    test('a refused generation says why and keeps Generate in reach', async ({ app, screen, browser }) => {
      await mockToolFailure(browser, ENDPOINT, { message: 'The model is busy, try again.' });
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS, TOTAL);
      await screen.getByRole('button', 'Generate').tap();

      await expect(screen.getByRole('alert')).toContainText('The model is busy, try again.', { timeout: 20_000 });
      await expect(progress(screen, ANSWERS.length, TOTAL)).toBeVisible();
      await expect(screen.getByText(ACTIVITY.topic)).toBeVisible();
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    test('running out of credits offers an upgrade', async ({ app, screen, browser }) => {
      await mockToolFailure(browser, ENDPOINT, { message: 'Not enough credits.', errorType: 'InsufficientCredits' });
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS, TOTAL);
      await screen.getByRole('button', 'Generate').tap();

      const dialog = screen.getByRole('dialog');
      await expect(dialog.getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
      await dialog.getByRole('button', 'Maybe Later').tap();
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    test('a saved project opens on its activity with its answers', async ({ app, screen, browser }) => {
      await mockSavedProject(browser, PROJECT_ID, OUTPUT, INPUTS);
      await mockToolApi(browser, ENDPOINT, OUTPUT);

      await app.open(`${ROUTE}?projectId=${PROJECT_ID}&projectName=Saved%20Activity`);
      await expect(screen.getByText('Saved Activity')).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByRole('heading', 'Listening Pairs')).toBeVisible();
      await expect(screen.getByText(ACTIVITY.topic)).toBeVisible();
      await expect(screen.getByRole('button', 'Regenerate')).toBeVisible();

      await screen.getByRole('button', 'New Project').tap();
      await expect(browser).toHaveURL(ROUTE);
    });

    test('switching the site to Arabic keeps the inputs a regenerate sends', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await switchToArabic(screen);
      await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(ACTIVITY.topic)).toBeVisible();

      await screen.getByRole('button', 'إعادة الإنشاء').tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
      expect(api.runs[1].inputs).toMatchObject(INPUTS);
    });
  }
);
