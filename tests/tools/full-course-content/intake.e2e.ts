import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockToolApi, mockUpload, UPLOADED_FILE_URL } from '../../helpers/tool-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { ANSWERS, COURSE, ENDPOINT, INPUTS, OUTPUT, PLACEHOLDER, ROUTE, TOOL_NAME, TOOL_NAME_AR, TOTAL } from './fixture.ts';

describe(
  'full course content: intake',
  { tags: ['tools', 'full-course-content'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('opens on the first question with nothing answered', async ({ app, screen }) => {
      await app.open(ROUTE);

      await expect(screen.getByRole('heading', TOOL_NAME)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
      await screen.getByPlaceholder(PLACEHOLDER.courseTitle).fill(COURSE.title);
      await screen.getByPlaceholder(PLACEHOLDER.courseTitle).press('Enter');
      await expect(progress(screen, 1, TOTAL)).toBeVisible();
    });

    test('Course Hours is a slider from 1 to 90, and its value goes out', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 8), TOTAL);

      const hours = screen.getByRole('slider', 'Course Hours');
      await expect(hours).toHaveValue('1');
      await expect(hours).toHaveAttribute('max', '90');
      await hours.fill('12');
      await screen.getByRole('button', 'Continue').tap();
      await screen.getByRole('button', 'Skip').tap();
      await screen.getByRole('button', 'Generate').tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(1);
      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, hours: 12 });
    });

    test('an optional question can be skipped, and Edit reopens an answer', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS, TOTAL);
      await expect(screen.getByText('Skipped')).toBeVisible();

      await screen.getByRole('button', 'Edit').first().tap();
      await screen.getByPlaceholder(PLACEHOLDER.courseTitle).fill('Listening at Work, Advanced');
      await screen.getByRole('button', 'Continue').tap();
      await expect(screen.getByText('Listening at Work, Advanced')).toBeVisible();
      await expect(progress(screen, ANSWERS.length, TOTAL)).toBeVisible();
    });

    test('an uploaded reference file goes out as the referenceLink', async ({ app, screen, browser }) => {
      await mockUpload(browser);
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, -1), TOTAL);

      await browser.locator('input[type="file"]').setInputFiles(['tests/fixtures/reference.txt']);
      await expect(screen.getByText('✓ File uploaded successfully')).toBeVisible({ timeout: 20_000 });
      await screen.getByPlaceholder(PLACEHOLDER.notes).fill('Two modules are enough');
      await screen.getByRole('button', 'Generate').tap();

      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(1);
      expect(api.runs[0].inputs).toMatchObject({ referenceLink: UPLOADED_FILE_URL, notes: 'Two modules are enough' });
    });

    test('switching the site to Arabic keeps every answer and the place', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS, TOTAL);

      await switchToArabic(screen);
      await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
      await expect(progress(screen, ANSWERS.length, TOTAL)).toBeVisible();
      await expect(screen.getByText(COURSE.title)).toBeVisible();

      await screen.getByRole('button', 'إنشاء').tap();
      await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(1);
      expect(api.runs[0].inputs).toMatchObject(INPUTS);
    });

    test('the agent answers every question and generates', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      const title = `${COURSE.title} ${Date.now()}`;

      expectCacheOutcome(
        await agent.act('answer Course Title with {title}, Learning Goal with {goal} and Target Audience with {audience}', {
          params: { title: unique(title), goal: COURSE.goal, audience: COURSE.audience }
        })
      );
      await expect(progress(screen, 3, TOTAL)).toBeVisible();

      expectCacheOutcome(
        await agent.act('choose {level}, then set the age range from {from} to {to} years and continue', {
          params: { level: 'Beginner', from: '20', to: '30' }
        })
      );
      await expect(progress(screen, 5, TOTAL)).toBeVisible();

      expectCacheOutcome(
        await agent.act('choose {language}, then {modules}, then {topics}', { params: { language: 'English', modules: '2 Modules', topics: '1 Topic' } })
      );
      await expect(progress(screen, 8, TOTAL)).toBeVisible();

      expectCacheOutcome(await agent.act('keep Course Hours as it is and continue, skip the Reference File, then press Generate'));
      await expect.poll(() => api.runs.length, { timeout: 30_000 }).toBe(1);

      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, courseTitle: title });
    });
  }
);
