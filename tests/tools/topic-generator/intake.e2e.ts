import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockToolApi, mockUpload, UPLOADED_FILE_URL } from '../../helpers/tool-api.ts';
import { answer, answerAll, progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { ANSWERS, ENDPOINT, INPUTS, LESSON, LESSON_TEXT, OUTPUT, PLACEHOLDER, ROUTE, TOOL_NAME, TOOL_NAME_AR, TOTAL } from './fixture.ts';

describe(
  'topic generator: intake',
  { tags: ['tools', 'topic-generator'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('opens on the first question with nothing answered', async ({ app, screen }) => {
      await app.open(ROUTE);

      await expect(screen.getByRole('heading', TOOL_NAME)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
    });

    test('a required question needs an answer, and Enter confirms it', async ({ app, screen }) => {
      await app.open(ROUTE);
      const topic = screen.getByPlaceholder(PLACEHOLDER.topicArea);

      await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
      await topic.fill(LESSON.topic);
      await expect(screen.getByRole('button', 'Continue')).toBeEnabled();
      await topic.press('Enter');
      await expect(progress(screen, 1, TOTAL)).toBeVisible();
      await expect(screen.getByText(LESSON.topic)).toBeVisible();
    });

    test('an Arabic lesson asks no extra question', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 5), TOTAL);

      await answer(screen, { choose: 'Arabic' });
      await expect(progress(screen, 6, TOTAL)).toBeVisible();
      await expect(screen.getByText(`Question 7/${TOTAL}`)).toBeVisible();
      await expect(screen.getByText('Number of Pages')).toBeVisible();
    });

    test('the two toggles start on and go out as they are left', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, -1), TOTAL);

      // Include Conclusion: on by default, switched off here
      await expect(screen.getByRole('checkbox')).toBeChecked();
      await browser.locator('label.q-switch').tap();
      await expect(screen.getByRole('checkbox')).not.toBeChecked();
      await screen.getByRole('button', 'Continue').tap();

      // Instructor Guide: on by default, left on
      await expect(screen.getByText(`Question ${TOTAL}/${TOTAL}`)).toBeVisible();
      await expect(screen.getByRole('checkbox')).toBeChecked();
      await screen.getByRole('button', 'Generate').tap();
      await expect(screen.getByRole('button', 'Refine Output')).toBeVisible({ timeout: 20_000 });

      expect(api.runs[0].inputs).toMatchObject({ conclusion: false, instructorGuide: true });
    });

    test('an optional question can be skipped, and Edit reopens an answer', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 7), TOTAL);

      await screen.getByRole('button', 'Skip').tap(); // Reference File
      await expect(progress(screen, 8, TOTAL)).toBeVisible();
      await expect(screen.getByText('Skipped')).toBeVisible();

      await screen.getByRole('button', 'Edit').first().tap();
      await screen.getByPlaceholder(PLACEHOLDER.topicArea).fill('Active Listening at Work');
      await screen.getByRole('button', 'Continue').tap();
      await expect(screen.getByText('Active Listening at Work')).toBeVisible();
      await expect(progress(screen, 8, TOTAL)).toBeVisible();
    });

    test('an uploaded reference file goes out as the referenceLink', async ({ app, screen, browser }) => {
      await mockUpload(browser);
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 7), TOTAL);

      await browser.locator('input[type="file"]').setInputFiles(['tests/fixtures/reference.txt']);
      await expect(screen.getByText('✓ File uploaded successfully')).toBeVisible({ timeout: 20_000 });
      await screen.getByPlaceholder(PLACEHOLDER.extraNotes).fill('Keep it to one page');
      await screen.getByRole('button', 'Continue').tap();
      await screen.getByRole('button', 'Continue').tap();
      await screen.getByRole('button', 'Generate').tap();
      await expect(screen.getByRole('button', 'Refine Output')).toBeVisible({ timeout: 20_000 });

      expect(api.runs[0].inputs).toMatchObject({ referenceLink: UPLOADED_FILE_URL, extraNotes: 'Keep it to one page' });
    });

    test('switching the site to Arabic keeps every answer and the place', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 8), TOTAL);

      await switchToArabic(screen);
      await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
      await expect(progress(screen, 8, TOTAL)).toBeVisible();
      await expect(screen.getByText(LESSON.topic)).toBeVisible();
      await expect(screen.getByText('تم التخطي')).toBeVisible();

      await screen.getByRole('button', 'تخطي').tap();
      await screen.getByRole('button', 'متابعة').tap();
      await screen.getByRole('button', 'إنشاء').tap();

      await expect(screen.getByRole('heading', LESSON_TEXT.heading)).toBeVisible({ timeout: 20_000 });
      expect(api.runs[0].inputs).toMatchObject(INPUTS);
    });

    test('the agent answers every question and generates', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      const topic = `${LESSON.topic} ${Date.now()}`;

      expectCacheOutcome(
        await agent.act('answer Topic Area with {topic}, Topic Objective with {objective} and Target Audience with {audience}', {
          params: { topic: unique(topic), objective: LESSON.objective, audience: LESSON.audience }
        })
      );
      await expect(progress(screen, 3, TOTAL)).toBeVisible();

      expectCacheOutcome(await agent.act('set the age range from {from} to {to} years and continue', { params: { from: '20', to: '30' } }));
      await expect(progress(screen, 4, TOTAL)).toBeVisible();

      expectCacheOutcome(
        await agent.act('choose {level}, then {language}, then {pages} pages', { params: { level: 'Beginner', language: 'English', pages: '2' } })
      );
      await expect(progress(screen, 7, TOTAL)).toBeVisible();

      expectCacheOutcome(await agent.act('skip Reference File and Extra Notes, keep both toggles on, then press Generate'));
      await expect(screen.getByRole('button', 'Refine Output')).toBeVisible({ timeout: 30_000 });

      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, topicArea: topic });
    });
  }
);
