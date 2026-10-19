import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockSavedProject, mockToolApi, mockToolFailure, PROJECT_ID, type MockOptions } from '../../helpers/tool-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import {
  addQuestionRow,
  ANSWERS_AFTER_MIX,
  ANSWERS_TO_MIX,
  ENDPOINT,
  INPUTS,
  OUTPUT,
  OUTPUT_AR,
  PLACEHOLDER,
  QUESTION_TEXT,
  QUIZ,
  ROUTE,
  TOOL_ID,
  TOOL_NAME,
  TOTAL
} from './fixture.ts';

const DEFAULT_TITLE = `Untitled - ${TOOL_NAME}`;
const MIX_STEP = ANSWERS_TO_MIX.length + 1;

/** Answers every question, one mix row, and generates against the stubbed API. */
async function generate(app: App, screen: Screen, browser: Browser, output: unknown = OUTPUT, options?: MockOptions) {
  const api = await mockToolApi(browser, ENDPOINT, output, options);
  await app.open(ROUTE);
  await answerAll(screen, ANSWERS_TO_MIX, TOTAL);
  await addQuestionRow(screen);
  await answerAll(screen, ANSWERS_AFTER_MIX, TOTAL, MIX_STEP);
  await screen.getByRole('button', 'Generate').tap();
  if (!options?.hold) {
    await expect(screen.getByText(QUESTION_TEXT.trueFalse)).toBeVisible({ timeout: 20_000 });
  }
  return api;
}

describe(
  'assessment: generate',
  { tags: ['tools', 'assessment'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('answering every question generates the assessment', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await expect(screen.getByRole('heading', 'Active Listening Check')).toBeVisible();
      await expect(screen.getByText(QUESTION_TEXT.first)).toBeVisible();
      await expect(screen.getByText('Interrupt early')).toBeVisible();
      await expect(screen.getByText('Answer Key')).toBeVisible();
      await expect(screen.getByText(QUESTION_TEXT.explanation)).toBeVisible();
      await expect(screen.getByText(DEFAULT_TITLE)).toBeVisible();

      expect(api.runs).toHaveLength(1);
      expect(api.runs[0].toolId).toBe(TOOL_ID);
      expect(api.runs[0].inputs).toMatchObject(INPUTS);
    });

    test('the loader holds the canvas until the assessment arrives', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser, OUTPUT, { hold: true });

      await expect(browser.locator('app-content-loader')).toBeVisible({ timeout: 10_000 });
      api.release();
      await expect(screen.getByText(QUESTION_TEXT.trueFalse)).toBeVisible({ timeout: 20_000 });
    });

    test('the questions and the answer key fold away and open again', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);
      const answerKey = screen.getByRole('button', /Answer Key/);

      await answerKey.tap();
      await expect(answerKey).toHaveAttribute('aria-expanded', 'false');
      await expect(screen.getByText(QUESTION_TEXT.explanation)).toHaveCount(0);
      // The questions above are untouched
      await expect(screen.getByText(QUESTION_TEXT.first)).toBeVisible();

      await answerKey.tap();
      await expect(screen.getByText(QUESTION_TEXT.explanation)).toBeVisible();
    });

    test('the agent folds the answer key away', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      await generate(app, screen, browser);

      await agent.act('collapse the Answer Key section');
      await expect(screen.getByRole('button', /Answer Key/)).toHaveAttribute('aria-expanded', 'false');
      await expect(screen.getByText(QUESTION_TEXT.explanation)).toHaveCount(0);
    });

    // Beside the document the inputs open on their last question. They used to
    // stop at the unused Reference File, with Regenerate out of sight until
    // that and Extra Notes were skipped all over again.
    test('Regenerate is in reach beside the assessment and runs the same answers again', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await expect(screen.getByRole('button', 'Regenerate')).toBeVisible();
      await expect(progress(screen, TOTAL - 1, TOTAL)).toBeVisible();
      await screen.getByRole('button', 'Regenerate').tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
      expect(api.runs[1].inputs).toMatchObject(INPUTS);
      await expect(screen.getByText(QUESTION_TEXT.trueFalse)).toBeVisible({ timeout: 20_000 });
    });

    test('New Project returns to a blank questionnaire with no rows', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'New Project').tap();
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.topic)).toHaveValue('');

      await answerAll(screen, ANSWERS_TO_MIX, TOTAL);
      await expect(screen.getByText('0/5')).toBeVisible();
    });

    test('renaming the project saves the new title', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);
      const title = 'Listening Quiz';

      await screen.getByText(DEFAULT_TITLE).tap();
      await screen.getByDisplayValue(DEFAULT_TITLE).fill(title);
      await screen.getByDisplayValue(title).press('Enter');

      await expect(screen.getByText(title)).toBeVisible();
      expect(api.renames).toEqual([{ projectId: PROJECT_ID, name: title }]);
    });

    test('Export downloads the assessment as a Word file', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'Export').tap();
      await expect(screen.getByText('Production Script (PDF)')).toBeVisible();
      await screen.getByText('Curriculum Outline (DOCX)').tap();

      const download = await browser.waitForDownload(() => screen.getByRole('button', 'Start Exporting').tap());
      expect(download.suggestedFilename).toBe(`${DEFAULT_TITLE}.docx`);
    });

    test('an Arabic assessment is not offered as PDF', async ({ app, screen, browser }) => {
      await generate(app, screen, browser, OUTPUT_AR);

      await expect(screen.getByRole('heading', 'اختبار الاستماع الفعال')).toBeVisible();
      await screen.getByRole('button', 'Export').tap();
      await expect(screen.getByText('Curriculum Outline (DOCX)')).toBeVisible();
      await expect(screen.getByText('Production Script (PDF)')).toHaveCount(0);
    });

    test('Copy all content confirms the copy', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await browser.locator('button.tool-copy-button').tap();
      await expect(screen.getByText('✓ Content copied to clipboard!')).toBeVisible();
    });

    test('a refused generation says why and keeps Generate in reach', async ({ app, screen, browser }) => {
      await mockToolFailure(browser, ENDPOINT, { message: 'The model is busy, try again.' });
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS_TO_MIX, TOTAL);
      await addQuestionRow(screen);
      await answerAll(screen, ANSWERS_AFTER_MIX, TOTAL, MIX_STEP);
      await screen.getByRole('button', 'Generate').tap();

      await expect(screen.getByRole('alert')).toContainText('The model is busy, try again.', { timeout: 20_000 });
      await expect(screen.getByText(QUIZ.topic)).toBeVisible();
      await expect(screen.getByText('1/5')).toBeVisible();
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    test('running out of credits offers an upgrade', async ({ app, screen, browser }) => {
      await mockToolFailure(browser, ENDPOINT, { message: 'Not enough credits.', errorType: 'InsufficientCredits' });
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS_TO_MIX, TOTAL);
      await addQuestionRow(screen);
      await answerAll(screen, ANSWERS_AFTER_MIX, TOTAL, MIX_STEP);
      await screen.getByRole('button', 'Generate').tap();

      const dialog = screen.getByRole('dialog');
      await expect(dialog.getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
      await dialog.getByRole('button', 'Maybe Later').tap();
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    // A saved assessment brings its answers back — the question mix included,
    // or there is nothing to run again with.
    test('a saved project opens with its answers and its question mix', async ({ app, screen, browser }) => {
      await mockSavedProject(browser, PROJECT_ID, OUTPUT, { ...INPUTS, questions: [{ type: 'True/False', points: 4 }] });
      await mockToolApi(browser, ENDPOINT, OUTPUT);

      await app.open(`${ROUTE}?projectId=${PROJECT_ID}&projectName=Saved%20Quiz`);
      await expect(screen.getByText('Saved Quiz')).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(QUESTION_TEXT.first)).toBeVisible();
      await expect(screen.getByText(QUIZ.topic)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.questionCount)).toHaveValue('4');
      // Nothing left to walk: Regenerate is on screen, not behind the Reference File
      await expect(screen.getByRole('button', 'Regenerate')).toBeVisible();
    });

    test('switching the site to Arabic keeps the inputs a regenerate sends', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await switchToArabic(screen);
      await expect(screen.getByText(QUIZ.topic)).toBeVisible({ timeout: 20_000 });

      await screen.getByRole('button', 'إعادة الإنشاء').tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
      expect(api.runs[1].inputs).toMatchObject(INPUTS);
    });
  }
);
