import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockSavedProject, mockToolApi, mockToolFailure, PROJECT_ID, type MockOptions } from '../../helpers/tool-api.ts';
import { mockCourseVideoApi } from '../../helpers/course-video-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import {
  ANSWERS,
  COURSE,
  COURSE_VIDEOS,
  ENDPOINT,
  MODULE_VIDEOS,
  OUTPUT,
  PLACEHOLDER,
  ROUTE,
  TOOL_ID,
  TOOL_NAME,
  TOOL_NAME_AR,
  TOTAL
} from './fixture.ts';

const DEFAULT_TITLE = `Untitled - ${TOOL_NAME}`;
const VIDEO_3 = 'Video three: block time on the calendar.';

/** Answers every question and generates against the stubbed API. */
async function generate(app: App, screen: Screen, browser: Browser, output: unknown = OUTPUT, options?: MockOptions) {
  const api = await mockToolApi(browser, ENDPOINT, output, options);
  await app.open(ROUTE);
  await answerAll(screen, ANSWERS, TOTAL);
  await screen.getByRole('button', 'Generate').tap();
  if (!options?.hold) {
    await expect(screen.getByText(VIDEO_3)).toBeVisible({ timeout: 20_000 });
  }
  return api;
}

/**
 * The canvas toolbar's Copy and Edit are icon buttons with no accessible name
 * (the mat-icon is aria-hidden, the tooltip only describes), so they are found
 * by class — a gap in the app, not a choice.
 */
function toolbarButton(browser: Browser, name: 'copy' | 'edit') {
  return browser.locator(`button.tool-${name}-button`);
}

describe(
  'full course script: generate',
  { tags: ['tools', 'full-course-script'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('answering every question generates the script', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await expect(screen.getByText('Module 1')).toBeVisible();
      await expect(screen.getByText(`${COURSE_VIDEOS} videos`)).toBeVisible();
      await expect(screen.getByText(`${MODULE_VIDEOS} videos`)).toBeVisible();
      await expect(screen.getByText('Welcome to Time Management Basics.')).toBeVisible();
      await expect(screen.getByText('You can now plan a productive week.')).toBeVisible();
      await expect(screen.getByText(DEFAULT_TITLE)).toBeVisible();

      expect(api.runs).toHaveLength(1);
      expect(api.runs[0].toolId).toBe(TOOL_ID);
      expect(api.runs[0].inputs).toMatchObject({
        courseTitle: COURSE.title,
        learningGoal: COURSE.goal,
        targetAudience: COURSE.audience,
        ageMin: '20',
        ageMax: '30',
        knowledgeLevel: 'Beginner',
        engagementStyle: 'practical',
        language: 'English',
        numberOfModules: '1',
        numberOfTopics: '2',
        referenceLink: ''
      });
      // Feedback belongs to a refine, never to a first run
      expect(api.runs[0].inputs.feedback ?? null).toBeNull();
    });

    test('the loader holds the canvas until the script arrives', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser, OUTPUT, { hold: true });

      await expect(browser.locator('app-content-loader')).toBeVisible({ timeout: 10_000 });
      await expect(screen.getByRole('button', 'Refine Output')).toHaveCount(0);
      api.release();
      await expect(screen.getByText(VIDEO_3)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByRole('button', 'Refine Output')).toBeVisible();
    });

    test('the agent folds a module away and opens it again', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      await generate(app, screen, browser);
      const moduleHead = screen.getByRole('button', /Module 1/);

      await agent.act('collapse Module 1 in the script');
      await expect(moduleHead).toHaveAttribute('aria-expanded', 'false');
      await expect(screen.getByText(VIDEO_3)).toHaveCount(0);

      await agent.act('expand Module 1 in the script again');
      await expect(moduleHead).toHaveAttribute('aria-expanded', 'true');
      await expect(screen.getByText(VIDEO_3)).toBeVisible();
    });

    // Not an agent step: the edit textareas share one placeholder and carry no
    // label, so a recording could not tell them apart (the cache reports
    // `truncated`) and every run would pay for the model.
    test('edits to a video script are saved', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);
      const script = 'Video three: protect two focus blocks every day.';

      await toolbarButton(browser, 'edit').tap();
      await expect(screen.getByText('Editing')).toBeVisible();
      await screen.getByPlaceholder('Enter video script...').nth(2).fill(script);
      await screen.getByRole('button', 'Save').tap();

      await expect(screen.getByText(script)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByRole('button', 'Save')).toHaveCount(0);

      expect(api.updates).toHaveLength(1);
      expect(api.updates[0].projectId).toBe(PROJECT_ID);
      const saved = api.updates[0].output as typeof OUTPUT;
      expect(saved.courseData.modules[0].topics[1].videos[0].script).toBe(script);
      // Untouched sections go back exactly as they came
      expect(saved.courseData.modules[0].topics[0].videos[0].script).toBe(OUTPUT.courseData.modules[0].topics[0].videos[0].script);
    });

    // A save that fails at the HTTP level ends in an error, not a completion:
    // the page used to stay "saving" for good, which also hid the message and
    // kept every button disabled.
    test('a save that fails outright says so and can be tried again', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);
      await browser.route(`**/api/${ENDPOINT}/update`, async (route) => {
        await route.fulfill({ status: 500, json: { title: 'Internal Server Error' } });
      });

      await toolbarButton(browser, 'edit').tap();
      await screen.getByPlaceholder('Enter video script...').nth(2).fill('Video three: protect two focus blocks every day.');
      await screen.getByRole('button', 'Save').tap();

      await expect(screen.getByRole('alert')).toContainText('Something went wrong. Please try again.', {
        timeout: 20_000
      });
      await expect(screen.getByRole('button', 'Save')).toBeEnabled();
      await expect(screen.getByRole('button', 'Cancel')).toBeEnabled();
    });

    test('cancelling an edit keeps the script as it was', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await toolbarButton(browser, 'edit').tap();
      await expect(screen.getByText('Editing')).toBeVisible();
      await screen.getByPlaceholder('Enter video script...').nth(2).fill('A draft nobody saved.');
      await screen.getByRole('button', 'Cancel').tap();

      await expect(screen.getByText(VIDEO_3)).toBeVisible();
      await expect(screen.getByText('A draft nobody saved.')).toHaveCount(0);
      expect(api.updates).toHaveLength(0);
    });

    test('the agent refines the script with feedback', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      const revised = structuredClone(OUTPUT);
      revised.courseData.courseIntro = 'Welcome back: this version adds real examples.';
      const api = await generate(app, screen, browser, (_run: unknown, index: number) => (index === 0 ? OUTPUT : revised));
      const feedback = 'Add a real example to every video';

      // The goal names the action only: asked to "refine the result", the agent
      // went on to judge the new document while it was still being revealed,
      // and called that a failure. Whether the refine landed is the check below.
      await agent.act('type {feedback} into the "Add feedback to refine result ..." box, then press Refine Output', {
        params: { feedback }
      });
      await expect(screen.getByText('Welcome back: this version adds real examples.')).toBeVisible({ timeout: 30_000 });

      expect(api.runs).toHaveLength(2);
      expect(api.runs[1].inputs).toMatchObject({ feedback, courseTitle: COURSE.title, language: 'English' });
    });

    // Beside a document the inputs are what a refine sends, so a language
    // switch that emptied them left Refine doing nothing at all.
    test('switching the site to Arabic keeps the inputs a refine sends', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);

      await switchToArabic(screen);
      await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(COURSE.title)).toBeVisible();
      await expect(screen.getByText(VIDEO_3)).toBeVisible();

      await screen.getByPlaceholder('أضف ملاحظاتك لتحسين النتيجة ...').fill('Shorter videos');
      await screen.getByRole('button', /تحسين الاستجابة/).tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
      expect(api.runs[1].inputs).toMatchObject({
        feedback: 'Shorter videos',
        courseTitle: COURSE.title,
        language: 'English',
        numberOfModules: '1',
        numberOfTopics: '2'
      });
    });

    test('Refine Output stays disabled until feedback is typed', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);
      const refine = screen.getByRole('button', 'Refine Output');

      await expect(refine).toBeDisabled();
      await screen.getByPlaceholder('Add feedback to refine result ...').fill('   ');
      await expect(refine).toBeDisabled();
      await screen.getByPlaceholder('Add feedback to refine result ...').fill('Shorter videos');
      await expect(refine).toBeEnabled();
    });

    test('the agent starts a new project from a finished script', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      await generate(app, screen, browser);

      await agent.act('start a new project');
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.courseTitle)).toHaveValue('');
      await expect(screen.getByText(VIDEO_3)).toHaveCount(0);
      await expect(browser).toHaveURL(ROUTE);
    });

    test('renaming the project saves the new title', async ({ app, screen, browser }) => {
      const api = await generate(app, screen, browser);
      const title = 'Weekly Planning Course';

      await screen.getByText(DEFAULT_TITLE).tap();
      await screen.getByDisplayValue(DEFAULT_TITLE).fill(title);
      await screen.getByDisplayValue(title).press('Enter');

      await expect(screen.getByText(title)).toBeVisible();
      expect(api.renames).toEqual([{ projectId: PROJECT_ID, name: title }]);
    });

    test('Export downloads the script as a Word file', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await screen.getByRole('button', 'Export').tap();
      await expect(screen.getByText('Export Studio Content')).toBeVisible();
      // An English script can go out as PDF too; only RTL hides it
      await expect(screen.getByText('Production Script (PDF)')).toBeVisible();
      await screen.getByText('Curriculum Outline (DOCX)').tap();

      const download = await browser.waitForDownload(() => screen.getByRole('button', 'Start Exporting').tap());
      expect(download.suggestedFilename).toBe(`${DEFAULT_TITLE}.docx`);
    });

    test('Copy all content confirms the copy', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);

      await toolbarButton(browser, 'copy').tap();
      await expect(screen.getByText('✓ Content copied to clipboard!')).toBeVisible();
    });

    // Generate a video no longer hands the script to the video generator: it
    // offers the two video types, and their dialogs keep the reader on the
    // script (tests/course-videos covers them). The course videos API is
    // stubbed so the part reads as free.
    test('Generate a video offers an avatar or an explainer video and stays on the script', async ({ app, screen, browser }) => {
      await mockCourseVideoApi(browser);
      await generate(app, screen, browser);

      await screen.getByRole('button', /^3 Video 3/).getByRole('button', 'Generate a video').tap();
      await expect(screen.getByRole('menuitem', /^Avatar Video/)).toBeEnabled();
      await expect(screen.getByRole('menuitem', /^Explainer Video/)).toBeEnabled();
      await expect(browser).toHaveURL(ROUTE);
    });

    // A refused run says why, and the questions come back as the reader left
    // them: every answer kept, the last question open with Generate on it.
    test('a refused generation says why and keeps Generate in reach', async ({ app, screen, browser }) => {
      await mockToolFailure(browser, ENDPOINT, { message: 'The model is busy, try again.' });
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS, TOTAL);
      await screen.getByRole('button', 'Generate').tap();

      await expect(screen.getByRole('alert')).toContainText('The model is busy, try again.', { timeout: 20_000 });
      await expect(progress(screen, ANSWERS.length, TOTAL)).toBeVisible();
      await expect(screen.getByText(COURSE.title)).toBeVisible();
      await expect(screen.getByText('20 – 30')).toBeVisible();
      await expect(screen.getByText('Module 1')).toHaveCount(0);

      // Pressing it again runs it again, and the message goes
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      await screen.getByRole('button', 'Generate').tap();
      await expect(screen.getByText(VIDEO_3)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByRole('alert')).toHaveCount(0);
    });

    test('a refused refine says why and keeps Generate in reach', async ({ app, screen, browser }) => {
      await generate(app, screen, browser);
      await mockToolFailure(browser, ENDPOINT, { message: 'Refine is unavailable right now.' });

      await screen.getByPlaceholder('Add feedback to refine result ...').fill('Shorter videos');
      await screen.getByRole('button', 'Refine Output').tap();

      await expect(screen.getByRole('alert')).toContainText('Refine is unavailable right now.', { timeout: 20_000 });
      await expect(progress(screen, ANSWERS.length, TOTAL)).toBeVisible();
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    test('running out of credits offers an upgrade', async ({ app, screen, browser }) => {
      await mockToolFailure(browser, ENDPOINT, { message: 'Not enough credits.', errorType: 'InsufficientCredits' });
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS, TOTAL);
      await screen.getByRole('button', 'Generate').tap();

      const dialog = screen.getByRole('dialog');
      await expect(dialog.getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
      await expect(dialog.getByRole('button', 'Upgrade Plan')).toBeVisible();
      await dialog.getByRole('button', 'Maybe Later').tap();
      await expect(screen.getByRole('dialog')).toHaveCount(0);
      await expect(screen.getByText(COURSE.title)).toBeVisible();
      await expect(screen.getByText('Module 1')).toHaveCount(0);
      // The dialog was the message; the questions wait on their last step
      await expect(screen.getByRole('alert')).toHaveCount(0);
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    test('a saved project opens on its script with its answers', async ({ app, screen, browser }) => {
      await mockSavedProject(browser, PROJECT_ID, OUTPUT, {
        courseTitle: COURSE.title,
        learningGoal: COURSE.goal,
        targetAudience: COURSE.audience,
        ageMin: '20',
        ageMax: '30',
        knowledgeLevel: 'Beginner',
        language: 'English',
        numberOfModules: '1',
        numberOfTopics: '2'
      });
      await mockToolApi(browser, ENDPOINT, OUTPUT);

      await app.open(`${ROUTE}?projectId=${PROJECT_ID}&projectName=My%20Saved%20Course`);
      await expect(screen.getByText('My Saved Course')).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(VIDEO_3)).toBeVisible();
      await expect(screen.getByText(COURSE.title)).toBeVisible();

      // Leaving it drops the project from the address, so a reload stays blank
      await screen.getByRole('button', 'New Project').tap();
      await expect(browser).toHaveURL(ROUTE);
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
    });
  }
);
