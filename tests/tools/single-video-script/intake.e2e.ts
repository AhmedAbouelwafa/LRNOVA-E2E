import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockToolApi, mockUpload, UPLOADED_FILE_URL } from '../../helpers/tool-api.ts';
import { answer, answerAll, option, progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { ANSWERS, ENDPOINT, INPUTS, OUTPUT, PLACEHOLDER, ROUTE, SCRIPT_LINES, TOOL_NAME, TOOL_NAME_AR, TOTAL, TOTAL_ARABIC, VIDEO } from './fixture.ts';

describe(
  'single video script: intake',
  { tags: ['tools', 'single-video-script'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('opens on the first question with nothing answered', async ({ app, screen }) => {
      await app.open(ROUTE);

      await expect(screen.getByRole('heading', TOOL_NAME)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByText('Topic Area')).toBeVisible();
      await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
      await expect(screen.getByRole('button', 'New Project')).toHaveCount(0);
    });

    test('a required question needs an answer before Continue', async ({ app, screen }) => {
      await app.open(ROUTE);
      const topic = screen.getByPlaceholder(PLACEHOLDER.topicArea);
      const next = screen.getByRole('button', 'Continue');

      await expect(next).toBeDisabled();
      await topic.fill(VIDEO.topic);
      await expect(next).toBeEnabled();
      await topic.fill('');
      await expect(next).toBeDisabled();
    });

    test('Enter confirms a typed answer', async ({ app, screen }) => {
      await app.open(ROUTE);

      await screen.getByPlaceholder(PLACEHOLDER.topicArea).fill(VIDEO.topic);
      await screen.getByPlaceholder(PLACEHOLDER.topicArea).press('Enter');

      await expect(progress(screen, 1, TOTAL)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.topicObjective)).toBeVisible();
      await expect(screen.getByText(VIDEO.topic)).toBeVisible();
    });

    test('an optional question can be skipped', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 5), TOTAL);

      await expect(screen.getByText('Engagement Style')).toBeVisible();
      await screen.getByRole('button', 'Skip').tap();

      await expect(progress(screen, 6, TOTAL)).toBeVisible();
      await expect(screen.getByText('Skipped')).toBeVisible();
    });

    test('Edit reopens an answered question without losing the place', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 3), TOTAL);

      await screen.getByRole('button', 'Edit').first().tap();
      await expect(screen.getByPlaceholder(PLACEHOLDER.topicArea)).toHaveValue(VIDEO.topic);
      await screen.getByPlaceholder(PLACEHOLDER.topicArea).fill('Active Listening at Work');
      await screen.getByRole('button', 'Continue').tap();

      await expect(screen.getByText('Active Listening at Work')).toBeVisible();
      await expect(progress(screen, 3, TOTAL)).toBeVisible();
    });

    test('Slang is asked only for an Arabic video', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 6), TOTAL);

      await option(screen, 'Arabic').tap();
      await expect(screen.getByText(`Question 8/${TOTAL_ARABIC}`)).toBeVisible();
      await expect(screen.getByText('Slang')).toBeVisible();
      await option(screen, 'Egyptian').tap();
      await expect(progress(screen, 8, TOTAL_ARABIC)).toBeVisible();

      // Back to English: Slang leaves, and Duration is still asked
      await screen.getByRole('button', 'Edit').nth(6).tap();
      await option(screen, 'English').tap();
      await expect(screen.getByText('Slang')).toHaveCount(0);
      await expect(progress(screen, 7, TOTAL)).toBeVisible();
      await expect(option(screen, '2 min')).toBeVisible();
    });

    test('an Arabic video sends its slang with the inputs', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, { ...OUTPUT, direction: 'rtl' });
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 6), TOTAL);
      await answer(screen, { choose: 'Arabic' });
      await answer(screen, { choose: 'Egyptian' });
      await answer(screen, { choose: '2 min' });
      await answer(screen, 'skip');
      await screen.getByRole('button', 'Generate').tap();

      await expect(screen.getByRole('button', 'Refine Output')).toBeVisible({ timeout: 20_000 });
      expect(api.runs[0].inputs).toMatchObject({ language: 'Arabic', dialect: 'Egyptian' });
    });

    test('switching to Arabic late asks Slang, then returns to where the reader was', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS, TOTAL);

      await screen.getByRole('button', 'Edit').nth(6).tap();
      await option(screen, 'Arabic').tap();
      await expect(screen.getByText(`Question 8/${TOTAL_ARABIC}`)).toBeVisible();

      await option(screen, 'Egyptian').tap();
      await expect(progress(screen, ANSWERS.length + 1, TOTAL_ARABIC)).toBeVisible();
      await screen.getByRole('button', 'Generate').tap();

      await expect(screen.getByRole('button', 'Refine Output')).toBeVisible({ timeout: 20_000 });
      expect(api.runs[0].inputs).toMatchObject({ language: 'Arabic', dialect: 'Egyptian', minutes: '2' });
    });

    test('switching the site to Arabic keeps every answer and the place', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, [...ANSWERS.slice(0, 5), 'skip'], TOTAL);

      await switchToArabic(screen);
      await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
      await expect(progress(screen, 6, TOTAL)).toBeVisible();
      await expect(screen.getByText(VIDEO.topic)).toBeVisible();
      await expect(screen.getByText('20 – 30')).toBeVisible();
      await expect(screen.getByText('تم التخطي')).toBeVisible();

      await answer(screen, { choose: 'الإنجليزية' });
      await answer(screen, { choose: 'دقيقتان' }); // "2 min"
      await screen.getByRole('button', 'تخطي').tap();
      await screen.getByRole('button', 'إنشاء').tap();

      await expect(scriptLine(screen)).toBeVisible({ timeout: 20_000 });
      expect(api.runs[0].inputs).toMatchObject({ topicArea: VIDEO.topic, ageMin: '20', ageMax: '30', language: 'English', minutes: '2' });
    });

    test('an uploaded reference file goes out as the referenceLink', async ({ app, screen, browser }) => {
      await mockUpload(browser);
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, -1), TOTAL);

      await expect(screen.getByText(`Question ${ANSWERS.length}/${TOTAL}`)).toBeVisible();
      await browser.locator('input[type="file"]').setInputFiles(['tests/fixtures/reference.txt']);
      await expect(screen.getByText('✓ File uploaded successfully')).toBeVisible({ timeout: 20_000 });
      await expect(progress(screen, ANSWERS.length, TOTAL)).toBeVisible();

      await screen.getByPlaceholder(PLACEHOLDER.notes).fill('Keep it under two minutes');
      await screen.getByRole('button', 'Generate').tap();
      await expect(screen.getByRole('button', 'Refine Output')).toBeVisible({ timeout: 20_000 });

      expect(api.runs[0].inputs).toMatchObject({ referenceLink: UPLOADED_FILE_URL, notes: 'Keep it under two minutes' });
    });

    test('the agent answers every question and generates', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      const topic = `${VIDEO.topic} ${Date.now()}`;

      expectCacheOutcome(
        await agent.act('answer Topic Area with {topic}, Topic Objective with {objective} and Target Audience with {audience}', {
          params: { topic: unique(topic), objective: VIDEO.objective, audience: VIDEO.audience }
        })
      );
      await expect(progress(screen, 3, TOTAL)).toBeVisible();

      expectCacheOutcome(await agent.act('set the age range from {from} to {to} years and continue', { params: { from: '20', to: '30' } }));
      await expect(progress(screen, 4, TOTAL)).toBeVisible();

      expectCacheOutcome(
        await agent.act('choose {level}, then {style}, then {language}', { params: { level: 'Beginner', style: 'Practical', language: 'English' } })
      );
      await expect(progress(screen, 7, TOTAL)).toBeVisible();

      expectCacheOutcome(await agent.act('choose {minutes}', { params: { minutes: '2 min' } }));
      await expect(progress(screen, 8, TOTAL)).toBeVisible();

      expectCacheOutcome(await agent.act('skip the Reference File question, then click Generate'));
      await expect(screen.getByRole('button', 'Refine Output')).toBeVisible({ timeout: 30_000 });

      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, topicArea: topic });
    });
  }
);

/** The opening line of the stubbed script, wherever its paragraph ends. */
function scriptLine(screen: import('e2e').Screen) {
  return screen.getByText(SCRIPT_LINES.hook, { exact: false });
}
