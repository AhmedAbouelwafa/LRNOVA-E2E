import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockToolApi, mockUpload, UPLOADED_FILE_URL } from '../../helpers/tool-api.ts';
import { answerAll, option, progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { ACTIVITY, ANSWERS, ENDPOINT, INPUTS, OUTPUT, PLACEHOLDER, ROUTE, TOOL_NAME, TOOL_NAME_AR, TOTAL } from './fixture.ts';

describe(
  'activity generator: intake',
  { tags: ['tools', 'activity-generator'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('opens on the first question with nothing answered', async ({ app, screen }) => {
      await app.open(ROUTE);

      await expect(screen.getByRole('heading', TOOL_NAME)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
      await screen.getByPlaceholder(PLACEHOLDER.activityTopic).fill(ACTIVITY.topic);
      await screen.getByPlaceholder(PLACEHOLDER.activityTopic).press('Enter');
      await expect(progress(screen, 1, TOTAL)).toBeVisible();
    });

    test('sixteen activity types: six on show, the rest behind View more', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 2), TOTAL);

      await expect(option(screen, 'Ice Breakers')).toBeVisible();
      await expect(option(screen, 'Roleplay')).toBeVisible();
      await expect(option(screen, 'Case Studies')).toHaveCount(0);

      await screen.getByRole('button', 'View more').tap();
      await option(screen, 'Case Studies').tap();
      await expect(progress(screen, 3, TOTAL)).toBeVisible();
      await expect(screen.getByText('Case Studies')).toBeVisible();
    });

    test('Available Resources is optional and goes out when given', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 9), TOTAL);

      await expect(screen.getByText('Optional')).toBeVisible();
      await screen.getByPlaceholder(PLACEHOLDER.availableResources).fill('Whiteboard, timer');
      await screen.getByRole('button', 'Continue').tap();
      await screen.getByRole('button', 'Skip').tap();
      await screen.getByRole('button', 'Generate').tap();
      await expect(screen.getByRole('heading', 'Listening Pairs')).toBeVisible({ timeout: 20_000 });

      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, availableResources: 'Whiteboard, timer' });
    });

    test('Edit reopens an answered question without losing the place', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 4), TOTAL);

      await screen.getByRole('button', 'Edit').nth(2).tap();
      await screen.getByRole('button', 'View more').tap();
      await option(screen, 'Peer Reviews').tap();

      await expect(screen.getByText('Peer Reviews')).toBeVisible();
      await expect(progress(screen, 4, TOTAL)).toBeVisible();
    });

    test('an uploaded reference file goes out as the referenceLink', async ({ app, screen, browser }) => {
      await mockUpload(browser);
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, -1), TOTAL);

      await browser.locator('input[type="file"]').setInputFiles(['tests/fixtures/reference.txt']);
      await expect(screen.getByText('✓ File uploaded successfully')).toBeVisible({ timeout: 20_000 });
      await screen.getByPlaceholder(PLACEHOLDER.extraNotes).fill('Keep it under fifteen minutes');
      await screen.getByRole('button', 'Generate').tap();
      await expect(screen.getByRole('heading', 'Listening Pairs')).toBeVisible({ timeout: 20_000 });

      expect(api.runs[0].inputs).toMatchObject({ referenceLink: UPLOADED_FILE_URL, extraNotes: 'Keep it under fifteen minutes' });
    });

    test('switching the site to Arabic keeps every answer and the place', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 10), TOTAL);

      await switchToArabic(screen);
      await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
      await expect(progress(screen, 10, TOTAL)).toBeVisible();
      await expect(screen.getByText(ACTIVITY.topic)).toBeVisible();

      await screen.getByRole('button', 'تخطي').tap();
      await screen.getByRole('button', 'إنشاء').tap();
      await expect(screen.getByRole('heading', 'Listening Pairs')).toBeVisible({ timeout: 20_000 });
      expect(api.runs[0].inputs).toMatchObject(INPUTS);
    });

    test('the agent answers every question and generates', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      const topic = `${ACTIVITY.topic} ${Date.now()}`;

      expectCacheOutcome(
        await agent.act('answer Activity Topic with {topic} and Activity Objective with {objective}, then choose {type}', {
          params: { topic: unique(topic), objective: ACTIVITY.objective, type: 'Roleplay' }
        })
      );
      await expect(progress(screen, 3, TOTAL)).toBeVisible();

      expectCacheOutcome(
        await agent.act('answer Target Audience with {audience}, then set the age range from {from} to {to} years and continue', {
          params: { audience: ACTIVITY.audience, from: '20', to: '30' }
        })
      );
      await expect(progress(screen, 5, TOTAL)).toBeVisible();

      expectCacheOutcome(
        await agent.act('choose {level}, then {language}, then {duration}, then {delivery}', {
          params: { level: 'Beginner', language: 'English', duration: '15 min', delivery: 'Classroom' }
        })
      );
      await expect(progress(screen, 9, TOTAL)).toBeVisible();

      expectCacheOutcome(await agent.act('skip Available Resources and the Reference File, then press Generate'));
      await expect(screen.getByRole('heading', 'Listening Pairs')).toBeVisible({ timeout: 30_000 });

      expect(api.runs[0].inputs).toMatchObject({ ...INPUTS, activityTopic: topic });
    });
  }
);
