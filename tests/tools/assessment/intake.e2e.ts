import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockToolApi, mockUpload, UPLOADED_FILE_URL } from '../../helpers/tool-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import {
  addQuestionRow,
  ANSWERS_AFTER_MIX,
  ANSWERS_TO_MIX,
  ENDPOINT,
  INPUTS,
  OUTPUT,
  PLACEHOLDER,
  QUIZ,
  ROUTE,
  TOOL_NAME,
  TOTAL
} from './fixture.ts';

/** The mix step is the eighth; its rows hold the flow until there is one. */
const MIX_STEP = ANSWERS_TO_MIX.length + 1;

describe(
  'assessment: intake',
  { tags: ['tools', 'assessment'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('opens on the first question with nothing answered', async ({ app, screen }) => {
      await app.open(ROUTE);

      await expect(screen.getByRole('heading', TOOL_NAME)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
      await screen.getByPlaceholder(PLACEHOLDER.topic).fill(QUIZ.topic);
      await expect(screen.getByRole('button', 'Continue')).toBeEnabled();
    });

    test('the question mix holds the flow until it has a row', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS_TO_MIX, TOTAL);

      await expect(screen.getByText(`Question ${MIX_STEP}/${TOTAL}`)).toBeVisible();
      await expect(screen.getByText('Add at least one question type to generate.')).toBeVisible();
      await expect(screen.getByText('0/5')).toBeVisible();
      // The question after the mix is not asked yet
      await expect(screen.getByText(`Question ${MIX_STEP + 1}/${TOTAL}`)).toHaveCount(0);

      await addQuestionRow(screen);
      await expect(screen.getByText('1/5')).toBeVisible();
      await expect(progress(screen, MIX_STEP, TOTAL)).toBeVisible();
      await expect(screen.getByText(`Question ${MIX_STEP + 1}/${TOTAL}`)).toBeVisible();
    });

    test('the mix takes at most five rows, and a row can be removed', async ({ app, screen, browser }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS_TO_MIX, TOTAL);

      for (let i = 0; i < 5; i++) {
        await addQuestionRow(screen);
      }
      await expect(screen.getByText('5/5')).toBeVisible();
      await expect(screen.getByRole('button', 'Add Question')).toBeDisabled();

      // The delete buttons are icon-only, with no name of their own
      await browser.locator('button.delete-question-btn').first().tap();
      await expect(screen.getByText('4/5')).toBeVisible();
      await expect(screen.getByRole('button', 'Add Question')).toBeEnabled();
    });

    test('each row sends its type and count', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS_TO_MIX, TOTAL);

      await addQuestionRow(screen);
      await addQuestionRow(screen);
      await browser.locator('mat-select').nth(1).tap();
      await screen.getByRole('option', 'True/False').tap();
      await screen.getByPlaceholder(PLACEHOLDER.questionCount).nth(0).fill('3');
      await screen.getByPlaceholder(PLACEHOLDER.questionCount).nth(1).fill('2');

      await answerAll(screen, ANSWERS_AFTER_MIX, TOTAL, MIX_STEP);
      await screen.getByRole('button', 'Generate').tap();
      await expect(screen.getByText('Active Listening Check')).toBeVisible({ timeout: 20_000 });

      expect(api.runs[0].inputs.questions).toEqual([
        { type: 'Multiple Choice', points: 3 },
        { type: 'True/False', points: 2 }
      ]);
    });

    test('a count over ten is refused and keeps Generate shut', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS_TO_MIX, TOTAL);
      await addQuestionRow(screen);
      await answerAll(screen, ANSWERS_AFTER_MIX, TOTAL, MIX_STEP);

      await screen.getByPlaceholder(PLACEHOLDER.questionCount).fill('11');
      await screen.getByPlaceholder(PLACEHOLDER.questionCount).press('Tab');
      await expect(screen.getByText('Maximum 10 points allowed')).toBeVisible();
      await expect(screen.getByRole('button', 'Generate')).toBeDisabled();

      await screen.getByPlaceholder(PLACEHOLDER.questionCount).fill('10');
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    test('Include Explanation, switched on, goes out with the run', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS_TO_MIX, TOTAL);
      await addQuestionRow(screen);
      await answerAll(screen, ANSWERS_AFTER_MIX, TOTAL, MIX_STEP);

      await expect(screen.getByText(`Question ${TOTAL}/${TOTAL}`)).toBeVisible();
      // The checkbox itself sits under its styled switch, which takes the click
      await browser.locator('label.q-switch').tap();
      await expect(screen.getByRole('checkbox')).toBeChecked();
      await screen.getByRole('button', 'Generate').tap();
      await expect(screen.getByText('Active Listening Check')).toBeVisible({ timeout: 20_000 });

      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, explanation: true });
    });

    test('an uploaded reference file goes out as the referenceLink', async ({ app, screen, browser }) => {
      await mockUpload(browser);
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS_TO_MIX, TOTAL);
      await addQuestionRow(screen);

      await browser.locator('input[type="file"]').setInputFiles(['tests/fixtures/reference.txt']);
      await expect(screen.getByText('✓ File uploaded successfully')).toBeVisible({ timeout: 20_000 });
      await screen.getByPlaceholder(PLACEHOLDER.extraNotes).fill('Focus on open questions');
      await screen.getByRole('button', 'Continue').tap();
      await screen.getByRole('button', 'Generate').tap();
      await expect(screen.getByText('Active Listening Check')).toBeVisible({ timeout: 20_000 });

      expect(api.runs[0].inputs).toMatchObject({ referenceLink: UPLOADED_FILE_URL, extraNotes: 'Focus on open questions' });
    });

    test('switching the site to Arabic keeps every answer, the rows and the place', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS_TO_MIX, TOTAL);
      await addQuestionRow(screen);
      await addQuestionRow(screen);

      await switchToArabic(screen);
      // This tool translates its own questions: the first one's name changes
      await expect(screen.getByText(QUIZ.topic)).toBeVisible({ timeout: 20_000 });
      await expect(progress(screen, MIX_STEP, TOTAL)).toBeVisible();
      await expect(screen.getByText('2/5')).toBeVisible();
      await expect(screen.getByText('20 – 30')).toBeVisible();
      await expect(screen.getByText('General Topic')).toHaveCount(0);
    });

    test('the agent answers every question and generates', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      const topic = `${QUIZ.topic} ${Date.now()}`;

      expectCacheOutcome(
        await agent.act('answer General Topic with {topic}, Sub Topic with {details} and Target Audience with {audience}', {
          params: { topic: unique(topic), details: QUIZ.details, audience: QUIZ.audience }
        })
      );
      await expect(progress(screen, 3, TOTAL)).toBeVisible();

      expectCacheOutcome(await agent.act('set the age range from {from} to {to} years and continue', { params: { from: '20', to: '30' } }));
      await expect(progress(screen, 4, TOTAL)).toBeVisible();

      expectCacheOutcome(
        await agent.act('choose {level}, then {difficulty}, then {language}', {
          params: { level: 'Beginner', difficulty: 'Medium', language: 'English' }
        })
      );
      await expect(progress(screen, 7, TOTAL)).toBeVisible();

      expectCacheOutcome(await agent.act('press Add Question once'));
      await expect(progress(screen, MIX_STEP, TOTAL)).toBeVisible();

      expectCacheOutcome(await agent.act('skip Reference File and Extra Notes, then press Generate'));
      await expect(screen.getByText('Active Listening Check')).toBeVisible({ timeout: 30_000 });

      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, topic });
    });
  }
);
