import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockSavedProject, mockToolApi, mockToolFailure, PROJECT_ID, type MockOptions } from '../../helpers/tool-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { ANSWERS, COURSE, ENDPOINT, INPUTS, OUTPUT, OUTPUT_AR, PLACEHOLDER, ROUTE, SECTIONS, TOOL_ID, TOOL_NAME, TOOL_NAME_AR, TOTAL } from './fixture.ts';

const DEFAULT_TITLE = `Untitled - ${TOOL_NAME}`;

/** A section's head: ordinal, title and child count read as one name. */
function sectionHead(screen: Screen, title: string) {
  return screen.getByRole('button', new RegExp(title));
}

/**
 * Answers every question and generates against the stubbed API, then waits
 * for the replay to hand over to the folded sections.
 */
async function generate(app: App, screen: Screen, browser: Browser, output: unknown = OUTPUT, options?: MockOptions) {
  const api = await mockToolApi(browser, ENDPOINT, output, options);
  await app.open(ROUTE);
  await answerAll(screen, ANSWERS, TOTAL);
  await screen.getByRole('button', 'Generate').tap();
  if (!options?.hold) {
    await expect(browser.locator('app-simulated-stream')).toHaveCount(0, { timeout: 30_000 });
  }
  return api;
}

function editor(browser: Browser) {
  return browser.locator('.ql-editor');
}

/** Icon-only toolbar buttons with no accessible name, found by class. */
function toolbarButton(browser: Browser, name: 'copy' | 'edit') {
  return browser.locator(`button.tool-${name}-button`);
}

describe(
  'full course content: generate',
  { tags: ['tools', 'full-course-content'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('answering every question generates the course, folded by heading', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await expect(screen.getByText(SECTIONS.preamble)).toBeVisible();
      await expect(sectionHead(screen, SECTIONS.module1)).toHaveAttribute('aria-expanded', 'true');
      await expect(sectionHead(screen, SECTIONS.topic1)).toBeVisible();
      await expect(sectionHead(screen, SECTIONS.module2)).toBeVisible();
      await expect(screen.getByText(SECTIONS.module1Body)).toBeVisible();
      await expect(screen.getByText(DEFAULT_TITLE)).toBeVisible();

      expect(api.runs).toHaveLength(1);
      expect(api.runs[0].toolId).toBe(TOOL_ID);
      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, referenceLink: '' });
    });

    test('a module folds away with its topics and opens again', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);
      const module1 = sectionHead(screen, SECTIONS.module1);

      await module1.tap();
      await expect(module1).toHaveAttribute('aria-expanded', 'false');
      await expect(screen.getByText(SECTIONS.module1Body)).toHaveCount(0);
      await expect(sectionHead(screen, SECTIONS.topic1)).toHaveCount(0);
      // The other module is untouched
      await expect(screen.getByText('Pair exercises with a timer.')).toBeVisible();

      await module1.tap();
      await expect(screen.getByText(SECTIONS.module1Body)).toBeVisible();
    });

    test('the agent folds a module away', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      await generate(app, screen, browser);

      await agent.act('collapse the {module} section', { params: { module: SECTIONS.module1 } });
      await expect(sectionHead(screen, SECTIONS.module1)).toHaveAttribute('aria-expanded', 'false');
      await expect(screen.getByText(SECTIONS.module1Body)).toHaveCount(0);
    });

    test('the loader holds the canvas until the course arrives', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser, OUTPUT, { hold: true });

      await expect(browser.locator('app-content-loader')).toBeVisible({ timeout: 10_000 });
      api.release();
      await expect(sectionHead(screen, SECTIONS.module2)).toBeVisible({ timeout: 30_000 });
    });

    test('edits to the course are saved as markdown', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);
      const text = 'A shorter course: listen first, then answer.';

      await toolbarButton(browser, 'edit').tap();
      await expect(editor(browser)).toContainText(SECTIONS.module1Body);
      await editor(browser).fill(text);
      await screen.getByRole('button', 'Save').tap();

      await expect(screen.getByText(text)).toBeVisible({ timeout: 20_000 });
      expect(api.updates).toHaveLength(1);
      expect(String((api.updates[0].output as { content: string }).content)).toContain(text);
      expect(api.updates[0].output).toMatchObject({ title: COURSE.title });
    });

    // The edit is sent as a new document; the direction has to go with it, or
    // an Arabic course comes back laid out left to right.
    test('saving an edit to an Arabic course keeps it right to left', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser, OUTPUT_AR);

      await toolbarButton(browser, 'edit').tap();
      await editor(browser).fill('دورة أقصر: استمع أولًا ثم أجب.');
      await screen.getByRole('button', 'Save').tap();

      await expect(screen.getByText('دورة أقصر: استمع أولًا ثم أجب.')).toBeVisible({ timeout: 20_000 });
      expect(api.updates[0].output).toMatchObject({ direction: 'rtl' });
      await expect(browser.locator('.tool-output-text')).toHaveAttribute('dir', 'rtl');
    });

    test('cancelling an edit keeps the course as it was', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await toolbarButton(browser, 'edit').tap();
      await editor(browser).fill('A draft nobody saved.');
      await screen.getByRole('button', 'Cancel').tap();

      await expect(screen.getByText(SECTIONS.module1Body)).toBeVisible();
      await expect(screen.getByText('A draft nobody saved.')).toHaveCount(0);
      expect(api.updates).toHaveLength(0);
    });

    // Beside the document the inputs open on their last question, not at the
    // unused Reference File (which hid Regenerate until skipped again).
    test('Regenerate is in reach beside the course and runs the same answers again', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await expect(screen.getByRole('button', 'Regenerate')).toBeVisible();
      await screen.getByRole('button', 'Regenerate').tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
      expect(api.runs[1].inputs).toMatchObject(INPUTS);
    });

    test('New Project returns to a blank questionnaire', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'New Project').tap();
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.courseTitle)).toHaveValue('');
      await expect(browser).toHaveURL(ROUTE);
    });

    test('renaming the project saves the new title', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);
      const title = 'Listening Course';

      await screen.getByText(DEFAULT_TITLE).tap();
      await screen.getByDisplayValue(DEFAULT_TITLE).fill(title);
      await screen.getByDisplayValue(title).press('Enter');

      await expect(screen.getByText(title)).toBeVisible();
      expect(api.renames).toEqual([{ projectId: PROJECT_ID, name: title }]);
    });

    test('Export downloads the course as a Word file', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'Export').tap();
      await expect(screen.getByText('Production Script (PDF)')).toBeVisible();
      await screen.getByText('Curriculum Outline (DOCX)').tap();

      const download = await browser.waitForDownload(() => screen.getByRole('button', 'Start Exporting').tap());
      expect(download.suggestedFilename).toBe(`${DEFAULT_TITLE}.docx`);
    });

    test('an Arabic course is not offered as PDF', async ({ app, screen, browser }) => {
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
      await expect(screen.getByText(COURSE.title)).toBeVisible();
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

    test('a saved project opens on its course with its answers', async ({ app, screen, browser }) => {
      await mockSavedProject(browser, PROJECT_ID, OUTPUT, INPUTS);
      await mockToolApi(browser, ENDPOINT, OUTPUT);

      await app.open(`${ROUTE}?projectId=${PROJECT_ID}&projectName=Saved%20Course`);
      await expect(screen.getByText('Saved Course')).toBeVisible({ timeout: 20_000 });
      await expect(sectionHead(screen, SECTIONS.module1)).toBeVisible();
      await expect(screen.getByText(COURSE.title)).toBeVisible();
      await expect(screen.getByRole('button', 'Regenerate')).toBeVisible();

      await screen.getByRole('button', 'New Project').tap();
      await expect(browser).toHaveURL(ROUTE);
    });

    test('switching the site to Arabic keeps the inputs a regenerate sends', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await switchToArabic(screen);
      await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(COURSE.title)).toBeVisible();

      await screen.getByRole('button', 'إعادة الإنشاء').tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
      expect(api.runs[1].inputs).toMatchObject(INPUTS);
    });
  }
);
