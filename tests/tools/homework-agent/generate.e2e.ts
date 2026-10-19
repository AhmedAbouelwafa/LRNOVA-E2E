import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  mockSavedProject,
  mockToolApi,
  mockToolFailure,
  mockToolHttpFailure,
  PROJECT_ID,
  type MockOptions
} from '../../helpers/tool-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import {
  addQuestionRow,
  ANSWERS_AFTER_MIX,
  ANSWERS_TO_MIX,
  DEFAULT_TITLE,
  ENDPOINT,
  INPUTS,
  MIX_STEP,
  OUTPUT,
  OUTPUT_AR,
  PLACEHOLDER,
  QUESTION_TEXT,
  QUIZ,
  ROUTE,
  TOOL_ID,
  TOOL_NAME_AR,
  TOTAL
} from './fixture.ts';

const TITLE = OUTPUT.assessment.assessmentTitle;

/** Answers every question up to Generate: the mix gets one row. */
async function answerEverything(screen: Screen) {
  await answerAll(screen, ANSWERS_TO_MIX, TOTAL);
  await addQuestionRow(screen);
  await answerAll(screen, ANSWERS_AFTER_MIX, TOTAL, MIX_STEP);
}

/**
 * Answers every question and generates against the stubbed API. Waits on the
 * homework's title rather than a question's text: see the test on question
 * text below.
 */
async function generate(app: App, screen: Screen, browser: Browser, output: unknown = OUTPUT, options?: MockOptions) {
  const api = await mockToolApi(browser, ENDPOINT, output, options);
  await app.open(ROUTE);
  await answerEverything(screen);
  await screen.getByRole('button', 'Generate').tap();
  if (!options?.hold) {
    await expect(screen.getByRole('heading', (output as typeof OUTPUT).assessment.assessmentTitle)).toBeVisible({ timeout: 20_000 });
  }
  return api;
}

describe(
  'homework agent: generate',
  { tags: ['tools', 'homework-agent'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('answering every question generates the homework', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await expect(screen.getByRole('tab', /^Overview/)).toBeVisible();
      await expect(screen.getByText('Interrupt early')).toBeVisible();
      await expect(screen.getByText(DEFAULT_TITLE)).toBeVisible();

      expect(api.runs).toHaveLength(1);
      expect(api.runs[0].toolId).toBe(TOOL_ID);
      expect(api.runs[0].inputs).toMatchObject(INPUTS);
    });

    // The template reads `point.pointText`; the assessment the API returns
    // (and the Assessment Agent reads) calls it `pointBody` — so every
    // question came out as "Point 1" over its choices, with no question.
    test('each question shows its text', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await expect(screen.getByText(QUESTION_TEXT.first)).toBeVisible();
      await expect(screen.getByText(QUESTION_TEXT.trueFalse)).toBeVisible();
    });

    // `ASSESSMENT.OPTIONS` is not a key in either language file (the Assessment
    // Agent uses `ASSESSMENT.CHOICES`), so the key itself was printed.
    test('the choices are headed in words, not a translation key', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await expect(screen.getByText('Interrupt early')).toBeVisible();
      await expect(screen.getByText('ASSESSMENT.', { exact: false })).toHaveCount(0);
    });

    test('the answer key gives each answer and its explanation, and folds away', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);
      const answerKey = screen.getByRole('button', /^Answer Key/);

      await expect(screen.getByText(QUESTION_TEXT.explanation)).toBeVisible();
      await expect(screen.getByText('Pauses give the speaker room.')).toBeVisible();

      await answerKey.tap();
      await expect(answerKey).toHaveAttribute('aria-expanded', 'false');
      await expect(screen.getByText(QUESTION_TEXT.explanation)).toHaveCount(0);
      await answerKey.tap();
      await expect(screen.getByText(QUESTION_TEXT.explanation)).toBeVisible();
    });

    test('the loader holds the canvas until the homework arrives', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser, OUTPUT, { hold: true });

      await expect(browser.locator('app-content-loader')).toBeVisible({ timeout: 10_000 });
      api.release();
      await expect(screen.getByRole('heading', TITLE)).toBeVisible({ timeout: 20_000 });
    });

    test('Regenerate is in reach beside the homework and runs the same answers again', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await expect(screen.getByRole('button', 'Regenerate')).toBeVisible();
      await expect(progress(screen, TOTAL - 1, TOTAL)).toBeVisible();
      await screen.getByRole('button', 'Regenerate').tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
      expect(api.runs[1].inputs).toMatchObject(INPUTS);
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

      await screen.getByText(DEFAULT_TITLE).tap();
      await screen.getByDisplayValue(DEFAULT_TITLE).fill('Listening Homework');
      await screen.getByDisplayValue('Listening Homework').press('Enter');

      await expect(screen.getByText('Listening Homework')).toBeVisible();
      expect(api.renames).toEqual([{ projectId: PROJECT_ID, name: 'Listening Homework' }]);
    });

    test('Export downloads the homework as a Word file', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'Export').tap();
      await expect(screen.getByText('Production Script (PDF)')).toBeVisible();
      await screen.getByText('Curriculum Outline (DOCX)').tap();

      const download = await browser.waitForDownload(() => screen.getByRole('button', 'Start Exporting').tap());
      expect(download.suggestedFilename).toBe(`${DEFAULT_TITLE}.docx`);
    });

    test('an Arabic homework is not offered as PDF', async ({ app, screen, browser }) => {
      await generate(app, screen, browser, OUTPUT_AR);

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
      await answerEverything(screen);
      await screen.getByRole('button', 'Generate').tap();

      await expect(screen.getByRole('alert')).toContainText('The model is busy, try again.', { timeout: 20_000 });
      await expect(screen.getByText(QUIZ.topic)).toBeVisible();
      await expect(screen.getByText('1/5')).toBeVisible();
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    test('a server error is told in plain words and keeps Generate in reach', async ({ app, screen, browser }) => {
      await mockToolHttpFailure(browser, ENDPOINT);
      await app.open(ROUTE);
      await answerEverything(screen);
      await screen.getByRole('button', 'Generate').tap();

      await expect(screen.getByRole('alert')).toContainText('Something went wrong. Please try again.', { timeout: 20_000 });
      await expect(screen.getByText(/Http failure/)).toHaveCount(0);
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    test('running out of credits offers an upgrade', async ({ app, screen, browser }) => {
      await mockToolFailure(browser, ENDPOINT, { message: 'Not enough credits.', errorType: 'InsufficientCredits' });
      await app.open(ROUTE);
      await answerEverything(screen);
      await screen.getByRole('button', 'Generate').tap();

      const dialog = screen.getByRole('dialog');
      await expect(dialog.getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
      await dialog.getByRole('button', 'Maybe Later').tap();
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    test('a saved project opens with its answers, its question mix and Regenerate', async ({ app, screen, browser }) => {
      await mockSavedProject(browser, PROJECT_ID, OUTPUT, { ...INPUTS, questions: [{ type: 'True/False', points: 4 }] });
      await mockToolApi(browser, ENDPOINT, OUTPUT);

      await app.open(`${ROUTE}?projectId=${PROJECT_ID}&projectName=Saved%20Homework`);
      await expect(screen.getByText('Saved Homework')).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByRole('heading', TITLE)).toBeVisible();
      await expect(screen.getByText(QUIZ.topic)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.questionCount)).toHaveValue('4');
      await expect(screen.getByRole('button', 'Regenerate')).toBeVisible();

      await screen.getByRole('button', 'New Project').tap();
      await expect(browser).toHaveURL(ROUTE);
    });

    test('switching the site to Arabic keeps the inputs a regenerate sends', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await switchToArabic(screen);
      await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(QUIZ.topic)).toBeVisible();

      await screen.getByRole('button', 'إعادة الإنشاء').tap();
      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
      expect(api.runs[1].inputs).toMatchObject(INPUTS);
    });
  }
);
