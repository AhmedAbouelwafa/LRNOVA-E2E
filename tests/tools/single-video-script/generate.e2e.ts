import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { blockVideoRenders, mockSavedProject, mockToolApi, mockToolFailure, PROJECT_ID, type MockOptions } from '../../helpers/tool-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { ANSWERS, ENDPOINT, INPUTS, OUTPUT, OUTPUT_AR, PLACEHOLDER, ROUTE, SCRIPT_LINES, TOOL_ID, TOOL_NAME, TOOL_NAME_AR, TOTAL, VIDEO } from './fixture.ts';

const DEFAULT_TITLE = `Untitled - ${TOOL_NAME}`;

/** A line of the script, wherever the paragraph holding it ends. */
function scriptLine(screen: Screen, line: string) {
  return screen.getByText(line, { exact: false });
}

/** Answers every question and generates against the stubbed API. */
async function generate(app: App, screen: Screen, browser: Browser, output: unknown = OUTPUT, options?: MockOptions) {
  await blockVideoRenders(browser);
  const api = await mockToolApi(browser, ENDPOINT, output, options);
  await app.open(ROUTE);
  await answerAll(screen, ANSWERS, TOTAL);
  await screen.getByRole('button', 'Generate').tap();
  if (!options?.hold) {
    await expect(screen.getByRole('button', 'Refine Output')).toBeVisible({ timeout: 20_000 });
  }
  return api;
}

/**
 * The canvas toolbar's Copy and Edit are icon buttons with no accessible name
 * (the mat-icon is aria-hidden, the tooltip only describes), so they are found
 * by class.
 */
function toolbarButton(browser: Browser, name: 'copy' | 'edit') {
  return browser.locator(`button.tool-${name}-button`);
}

describe(
  'single video script: generate',
  { tags: ['tools', 'single-video-script'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('answering every question generates the script', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await expect(scriptLine(screen, SCRIPT_LINES.hook)).toBeVisible({ timeout: 20_000 });
      await expect(scriptLine(screen, SCRIPT_LINES.close)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(DEFAULT_TITLE)).toBeVisible();
      await expect(screen.getByText('Turn this script into a video')).toBeVisible();

      expect(api.runs).toHaveLength(1);
      expect(api.runs[0].toolId).toBe(TOOL_ID);
      // This tool asks for plain text, not markdown
      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, referenceLink: '', markdown: false });
      expect(api.runs[0].inputs.feedback ?? null).toBeNull();
    });

    test('the loader holds the canvas until the script arrives', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser, OUTPUT, { hold: true });

      await expect(browser.locator('app-content-loader')).toBeVisible({ timeout: 10_000 });
      await expect(screen.getByRole('button', 'Refine Output')).toHaveCount(0);
      api.release();
      await expect(scriptLine(screen, SCRIPT_LINES.hook)).toBeVisible({ timeout: 20_000 });
    });

    test('edits to the script are saved', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);
      const script = 'A shorter script: listen first, then answer.';

      await toolbarButton(browser, 'edit').tap();
      await expect(screen.getByText('Editing')).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.script)).toHaveValue(OUTPUT.script);
      await screen.getByPlaceholder(PLACEHOLDER.script).fill(script);
      await screen.getByRole('button', 'Save').tap();

      await expect(scriptLine(screen, script)).toBeVisible({ timeout: 20_000 });
      expect(api.updates).toHaveLength(1);
      expect(api.updates[0].projectId).toBe(PROJECT_ID);
      expect(api.updates[0].output).toMatchObject({ script });
    });

    // The edit is sent as a new document; the direction has to go with it, or
    // an Arabic script comes back laid out left to right.
    test('saving an edit to an Arabic script keeps it right to left', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser, OUTPUT_AR);
      const script = 'نص أقصر: استمع أولًا ثم أجب.';

      await toolbarButton(browser, 'edit').tap();
      await screen.getByPlaceholder(PLACEHOLDER.script).fill(script);
      await screen.getByRole('button', 'Save').tap();

      await expect(scriptLine(screen, script)).toBeVisible({ timeout: 20_000 });
      expect(api.updates[0].output).toMatchObject({ script, direction: 'rtl' });
      await expect(browser.locator('.tool-output-text')).toHaveAttribute('style', /direction: rtl/);
    });

    test('Save stays disabled while the script is empty', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await toolbarButton(browser, 'edit').tap();
      await screen.getByPlaceholder(PLACEHOLDER.script).fill('   ');
      await expect(screen.getByRole('button', 'Save')).toBeDisabled();
      await screen.getByPlaceholder(PLACEHOLDER.script).fill('Listen first.');
      await expect(screen.getByRole('button', 'Save')).toBeEnabled();
    });

    test('cancelling an edit keeps the script as it was', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await toolbarButton(browser, 'edit').tap();
      await screen.getByPlaceholder(PLACEHOLDER.script).fill('A draft nobody saved.');
      await screen.getByRole('button', 'Cancel').tap();

      await expect(scriptLine(screen, SCRIPT_LINES.hook)).toBeVisible();
      await expect(screen.getByText('A draft nobody saved.')).toHaveCount(0);
      expect(api.updates).toHaveLength(0);
    });

    test('the agent refines the script with feedback', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      const revised = { ...OUTPUT, script: 'Revised: three real examples of active listening.' };
      const api = await generate(app, screen, browser, (_run: unknown, index: number) => (index === 0 ? OUTPUT : revised));
      const feedback = 'Add three real examples';

      await agent.act('type {feedback} into the "Add feedback to refine result ..." box, then press Refine Output', {
        params: { feedback }
      });
      await expect(scriptLine(screen, 'Revised: three real examples')).toBeVisible({ timeout: 30_000 });

      expect(api.runs).toHaveLength(2);
      expect(api.runs[1].inputs).toMatchObject({ ...INPUTS, feedback });
    });

    test('Refine Output stays disabled until feedback is typed', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);
      const refine = screen.getByRole('button', 'Refine Output');

      await expect(refine).toBeDisabled();
      await screen.getByPlaceholder('Add feedback to refine result ...').fill('   ');
      await expect(refine).toBeDisabled();
      await screen.getByPlaceholder('Add feedback to refine result ...').fill('Shorter');
      await expect(refine).toBeEnabled();
    });

    test('the agent starts a new project from a finished script', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      await generate(app, screen, browser);

      await agent.act('start a new project');
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.topicArea)).toHaveValue('');
      await expect(browser).toHaveURL(ROUTE);
    });

    test('New Project returns to a blank questionnaire', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'New Project').tap();
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.topicArea)).toHaveValue('');
      await expect(scriptLine(screen, SCRIPT_LINES.hook)).toHaveCount(0);
    });

    test('renaming the project saves the new title', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);
      const title = 'Listening Video';

      await screen.getByText(DEFAULT_TITLE).tap();
      await screen.getByDisplayValue(DEFAULT_TITLE).fill(title);
      await screen.getByDisplayValue(title).press('Enter');

      await expect(screen.getByText(title)).toBeVisible();
      expect(api.renames).toEqual([{ projectId: PROJECT_ID, name: title }]);
    });

    test('Export downloads the script as a Word file', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'Export').tap();
      await expect(screen.getByText('Production Script (PDF)')).toBeVisible();
      await screen.getByText('Curriculum Outline (DOCX)').tap();

      const download = await browser.waitForDownload(() => screen.getByRole('button', 'Start Exporting').tap());
      expect(download.suggestedFilename).toBe(`${DEFAULT_TITLE}.docx`);
    });

    test('an Arabic script is not offered as PDF', async ({ app, screen, browser }) => {
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
      await expect(screen.getByText(VIDEO.topic)).toBeVisible();
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
      await expect(screen.getByRole('dialog')).toHaveCount(0);
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    test('a saved project opens on its script with its answers', async ({ app, screen, browser }) => {
      await blockVideoRenders(browser);
      await mockSavedProject(browser, PROJECT_ID, OUTPUT, INPUTS);
      await mockToolApi(browser, ENDPOINT, OUTPUT);

      await app.open(`${ROUTE}?projectId=${PROJECT_ID}&projectName=Saved%20Video`);
      await expect(screen.getByText('Saved Video')).toBeVisible({ timeout: 20_000 });
      await expect(scriptLine(screen, SCRIPT_LINES.hook)).toBeVisible();
      await expect(screen.getByText(VIDEO.topic)).toBeVisible();

      await screen.getByRole('button', 'New Project').tap();
      await expect(browser).toHaveURL(ROUTE);
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
    });

    test('switching the site to Arabic keeps the inputs a refine sends', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await switchToArabic(screen);
      await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(VIDEO.topic)).toBeVisible();

      await screen.getByPlaceholder('أضف ملاحظاتك لتحسين النتيجة ...').fill('Shorter');
      await screen.getByRole('button', /تحسين الاستجابة/).tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
      expect(api.runs[1].inputs).toMatchObject({ ...INPUTS, feedback: 'Shorter' });
    });
  }
);
