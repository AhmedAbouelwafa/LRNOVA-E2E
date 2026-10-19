import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockSavedProject, mockToolApi, mockToolFailure, PROJECT_ID, type MockOptions } from '../../helpers/tool-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { ANSWERS, ENDPOINT, INPUTS, LESSON, LESSON_TEXT, OUTPUT, OUTPUT_AR, PLACEHOLDER, ROUTE, TOOL_ID, TOOL_NAME, TOOL_NAME_AR, TOTAL } from './fixture.ts';

const DEFAULT_TITLE = `Untitled - ${TOOL_NAME}`;

/** Answers every question and generates against the stubbed API. */
async function generate(app: App, screen: Screen, browser: Browser, output: unknown = OUTPUT, options?: MockOptions) {
  const api = await mockToolApi(browser, ENDPOINT, output, options);
  await app.open(ROUTE);
  await answerAll(screen, ANSWERS, TOTAL);
  await screen.getByRole('button', 'Generate').tap();
  if (!options?.hold) {
    await expect(screen.getByRole('button', 'Refine Output')).toBeVisible({ timeout: 20_000 });
  }
  return api;
}

/** The lesson editor is Quill: a contenteditable surface, filled directly. */
function editor(browser: Browser) {
  return browser.locator('.ql-editor');
}

/** Icon-only toolbar buttons with no accessible name, found by class. */
function toolbarButton(browser: Browser, name: 'copy' | 'edit') {
  return browser.locator(`button.tool-${name}-button`);
}

describe(
  'topic generator: generate',
  { tags: ['tools', 'topic-generator'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('answering every question generates the lesson', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      // The lesson is markdown, rendered: a real heading and a real list
      await expect(screen.getByRole('heading', LESSON_TEXT.heading)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByRole('listitem').filter({ hasText: LESSON_TEXT.item })).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(DEFAULT_TITLE)).toBeVisible();

      expect(api.runs).toHaveLength(1);
      expect(api.runs[0].toolId).toBe(TOOL_ID);
      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, referenceLink: '', markdown: true, oldGeneration: '' });
      expect(api.runs[0].inputs.feedback ?? null).toBeNull();
    });

    test('the loader holds the canvas until the lesson arrives', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser, OUTPUT, { hold: true });

      await expect(browser.locator('app-content-loader')).toBeVisible({ timeout: 10_000 });
      api.release();
      await expect(screen.getByRole('heading', LESSON_TEXT.heading)).toBeVisible({ timeout: 20_000 });
    });

    test('edits to the lesson are saved as markdown', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);
      const text = 'A shorter lesson: listen first, then answer.';

      await toolbarButton(browser, 'edit').tap();
      await expect(editor(browser)).toContainText(LESSON_TEXT.body);
      await editor(browser).fill(text);
      await screen.getByRole('button', 'Save').tap();

      await expect(screen.getByText(text)).toBeVisible({ timeout: 20_000 });
      expect(api.updates).toHaveLength(1);
      expect(api.updates[0].projectId).toBe(PROJECT_ID);
      expect(String((api.updates[0].output as { generatedTopic: string }).generatedTopic)).toContain(text);
    });

    // The edit is sent as a new document; the direction has to go with it, or
    // an Arabic lesson comes back laid out left to right.
    test('saving an edit to an Arabic lesson keeps it right to left', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser, OUTPUT_AR);

      await toolbarButton(browser, 'edit').tap();
      await editor(browser).fill('درس أقصر: استمع أولًا ثم أجب.');
      await screen.getByRole('button', 'Save').tap();

      await expect(screen.getByText('درس أقصر: استمع أولًا ثم أجب.')).toBeVisible({ timeout: 20_000 });
      expect(api.updates[0].output).toMatchObject({ direction: 'rtl' });
      await expect(browser.locator('.tool-output-text')).toHaveAttribute('dir', 'rtl');
    });

    test('cancelling an edit keeps the lesson as it was', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await toolbarButton(browser, 'edit').tap();
      await editor(browser).fill('A draft nobody saved.');
      await screen.getByRole('button', 'Cancel').tap();

      await expect(screen.getByRole('heading', LESSON_TEXT.heading)).toBeVisible();
      await expect(screen.getByText('A draft nobody saved.')).toHaveCount(0);
      expect(api.updates).toHaveLength(0);
    });

    test('an emptied lesson is not saved', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await toolbarButton(browser, 'edit').tap();
      await editor(browser).fill('');
      await screen.getByRole('button', 'Save').tap();

      await expect(screen.getByRole('alert')).toContainText("The document can't be empty.");
      expect(api.updates).toHaveLength(0);
    });

    test('the agent refines the lesson with feedback', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      const revised = { ...OUTPUT, generatedTopic: '## Revised lesson\n\nThree real examples of active listening.\n' };
      const api = await generate(app, screen, browser, (_run: unknown, index: number) => (index === 0 ? OUTPUT : revised));
      const feedback = 'Add three real examples';

      await agent.act('type {feedback} into the "Add feedback to refine result ..." box, then press Refine Output', {
        params: { feedback }
      });
      await expect(screen.getByRole('heading', 'Revised lesson')).toBeVisible({ timeout: 30_000 });

      expect(api.runs).toHaveLength(2);
      expect(api.runs[1].inputs).toMatchObject({ ...INPUTS, feedback });
    });

    test('Refine Output stays disabled until feedback is typed', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);
      const refine = screen.getByRole('button', 'Refine Output');

      await expect(refine).toBeDisabled();
      await screen.getByPlaceholder('Add feedback to refine result ...').fill('Shorter');
      await expect(refine).toBeEnabled();
    });

    test('New Project returns to a blank questionnaire with the toggles back on', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'New Project').tap();
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.topicArea)).toHaveValue('');
      await expect(browser).toHaveURL(ROUTE);
    });

    test('renaming the project saves the new title', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);
      const title = 'Listening Lesson';

      await screen.getByText(DEFAULT_TITLE).tap();
      await screen.getByDisplayValue(DEFAULT_TITLE).fill(title);
      await screen.getByDisplayValue(title).press('Enter');

      await expect(screen.getByText(title)).toBeVisible();
      expect(api.renames).toEqual([{ projectId: PROJECT_ID, name: title }]);
    });

    test('Export downloads the lesson as a Word file', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'Export').tap();
      await expect(screen.getByText('Production Script (PDF)')).toBeVisible();
      await screen.getByText('Curriculum Outline (DOCX)').tap();

      const download = await browser.waitForDownload(() => screen.getByRole('button', 'Start Exporting').tap());
      expect(download.suggestedFilename).toBe(`${DEFAULT_TITLE}.docx`);
    });

    test('an Arabic lesson is not offered as PDF', async ({ app, screen, browser }) => {
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
      await expect(screen.getByText(LESSON.topic)).toBeVisible();
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    test('a refused refine says why and keeps Generate in reach', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);
      await mockToolFailure(browser, ENDPOINT, { message: 'Refine is unavailable right now.' });

      await screen.getByPlaceholder('Add feedback to refine result ...').fill('Shorter');
      await screen.getByRole('button', 'Refine Output').tap();

      await expect(screen.getByRole('alert')).toContainText('Refine is unavailable right now.', { timeout: 20_000 });
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

    test('a saved project opens on its lesson with its answers', async ({ app, screen, browser }) => {
      await mockSavedProject(browser, PROJECT_ID, OUTPUT, INPUTS);
      await mockToolApi(browser, ENDPOINT, OUTPUT);

      await app.open(`${ROUTE}?projectId=${PROJECT_ID}&projectName=Saved%20Lesson`);
      await expect(screen.getByText('Saved Lesson')).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByRole('heading', LESSON_TEXT.heading)).toBeVisible();
      await expect(screen.getByText(LESSON.topic)).toBeVisible();

      await screen.getByRole('button', 'New Project').tap();
      await expect(browser).toHaveURL(ROUTE);
    });

    test('switching the site to Arabic keeps the inputs a refine sends', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await switchToArabic(screen);
      await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(LESSON.topic)).toBeVisible();

      await screen.getByPlaceholder('أضف ملاحظاتك لتحسين النتيجة ...').fill('Shorter');
      await screen.getByRole('button', /تحسين الاستجابة/).tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
      expect(api.runs[1].inputs).toMatchObject({ ...INPUTS, feedback: 'Shorter' });
    });
  }
);
