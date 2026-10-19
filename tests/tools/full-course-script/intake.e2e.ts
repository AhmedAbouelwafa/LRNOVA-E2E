import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { mockToolApi, mockUpload, UPLOADED_FILE_URL } from '../../helpers/tool-api.ts';
import { ageChip, answer, answerAll, option, progress } from '../../helpers/questionnaire.ts';
import { expectCacheOutcome, TOOL_CONTEXT } from '../../helpers/agent.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { ANSWERS, COURSE, ENDPOINT, OUTPUT, PLACEHOLDER, ROUTE, TOOL_NAME, TOOL_NAME_AR, TOTAL, TOTAL_ARABIC } from './fixture.ts';

describe(
  'full course script: intake',
  { tags: ['tools', 'full-course-script'], session: 'member', agentContext: TOOL_CONTEXT, timeout: 300_000 },
  () => {
    test('opens on the first question with nothing answered', async ({ app, screen }) => {
      await app.open(ROUTE);

      await expect(screen.getByRole('heading', TOOL_NAME)).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(`Question 1/${TOTAL}`)).toBeVisible();
      await expect(progress(screen, 0, TOTAL)).toBeVisible();
      await expect(screen.getByText('Course Title')).toBeVisible();
      await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
      // No document yet, so no canvas and none of its actions
      await expect(screen.getByRole('button', 'New Project')).toHaveCount(0);
      await expect(screen.getByRole('button', 'Export')).toHaveCount(0);
    });

    test('a required question needs an answer before Continue', async ({ app, screen }) => {
      await app.open(ROUTE);
      const title = screen.getByPlaceholder(PLACEHOLDER.courseTitle);
      const next = screen.getByRole('button', 'Continue');

      await expect(next).toBeDisabled();
      await title.fill(COURSE.title);
      await expect(next).toBeEnabled();
      await title.fill('');
      await expect(next).toBeDisabled();
    });

    test('Enter confirms a typed answer', async ({ app, screen }) => {
      await app.open(ROUTE);

      await screen.getByPlaceholder(PLACEHOLDER.courseTitle).fill(COURSE.title);
      await screen.getByPlaceholder(PLACEHOLDER.courseTitle).press('Enter');

      await expect(progress(screen, 1, TOTAL)).toBeVisible();
      await expect(screen.getByText(`Question 2/${TOTAL}`)).toBeVisible();
      await expect(screen.getByPlaceholder(PLACEHOLDER.learningGoal)).toBeVisible();
      await expect(screen.getByText(COURSE.title)).toBeVisible();
    });

    test('the age range reads the same whichever end is picked first', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 3), TOTAL);

      await expect(screen.getByText('Pick two ages — in either order')).toBeVisible();
      await ageChip(screen, 45).tap();
      await expect(screen.getByText('Now pick the other end of the range')).toBeVisible();
      await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
      await ageChip(screen, 25).tap();

      await expect(screen.getByText('25 – 45')).toBeVisible();
      await screen.getByRole('button', 'Continue').tap();
      await expect(progress(screen, 4, TOTAL)).toBeVisible();
      await expect(screen.getByText('25 – 45')).toBeVisible();
    });

    test('an optional question can be skipped', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 5), TOTAL);

      // Engagement Style is optional: Skip moves on with nothing chosen
      await expect(screen.getByText('Engagement Style')).toBeVisible();
      await expect(screen.getByText('Optional')).toBeVisible();
      await screen.getByRole('button', 'Skip').tap();

      await expect(progress(screen, 6, TOTAL)).toBeVisible();
      await expect(screen.getByText('Skipped')).toBeVisible();
    });

    test('Edit reopens an answered question without losing the place', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 3), TOTAL);

      await screen.getByRole('button', 'Edit').first().tap();
      await expect(screen.getByPlaceholder(PLACEHOLDER.courseTitle)).toHaveValue(COURSE.title);
      await screen.getByPlaceholder(PLACEHOLDER.courseTitle).fill('Time Management Essentials');
      await screen.getByRole('button', 'Continue').tap();

      await expect(screen.getByText('Time Management Essentials')).toBeVisible();
      await expect(progress(screen, 3, TOTAL)).toBeVisible();
      // Back on the question the reader had reached
      await expect(screen.getByText('Pick two ages — in either order')).toBeVisible();
    });

    test('Slang is asked only for an Arabic course', async ({ app, screen }) => {
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 6), TOTAL);

      await option(screen, 'Arabic').tap();
      await expect(screen.getByText(`Question 8/${TOTAL_ARABIC}`)).toBeVisible();
      await expect(screen.getByText('Slang')).toBeVisible();

      // Nineteen dialects: six on show, the rest behind View more
      await expect(option(screen, 'Egyptian')).toBeVisible();
      await expect(option(screen, 'Saudi')).toHaveCount(0);
      await screen.getByRole('button', 'View more').tap();
      await expect(option(screen, 'Saudi')).toBeVisible();
      await option(screen, 'Saudi').tap();
      await expect(progress(screen, 8, TOTAL_ARABIC)).toBeVisible();

      // Back to English: the Slang question leaves the flow, and the question
      // after it is still asked rather than collapsed as answered
      await screen.getByRole('button', 'Edit').nth(6).tap();
      await option(screen, 'English').tap();
      await expect(screen.getByText('Slang')).toHaveCount(0);
      await expect(progress(screen, 7, TOTAL)).toBeVisible();
      await expect(option(screen, '1 module')).toBeVisible();
    });

    test('switching to Arabic late asks Slang, then returns to where the reader was', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, { ...OUTPUT, direction: 'rtl' });
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS, TOTAL);

      // Every question answered but the last; now the course becomes Arabic
      await screen.getByRole('button', 'Edit').nth(6).tap();
      await option(screen, 'Arabic').tap();
      await expect(screen.getByText(`Question 8/${TOTAL_ARABIC}`)).toBeVisible();
      await expect(progress(screen, 7, TOTAL_ARABIC)).toBeVisible();

      // Answered, the flow goes straight back to the last question: modules,
      // topics and the skipped file keep their answers
      await option(screen, 'Egyptian').tap();
      await expect(progress(screen, ANSWERS.length + 1, TOTAL_ARABIC)).toBeVisible();
      await screen.getByRole('button', 'Generate').tap();

      await expect(screen.getByText('Module 1')).toBeVisible({ timeout: 20_000 });
      expect(api.runs[0].inputs).toMatchObject({
        language: 'Arabic',
        dialect: 'Egyptian',
        numberOfModules: '1',
        numberOfTopics: '2'
      });
    });

    test('an Arabic course sends its slang with the inputs', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, { ...OUTPUT, direction: 'rtl' });
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS.slice(0, 6), TOTAL);
      await answer(screen, { choose: 'Arabic' });
      await answer(screen, { choose: 'Egyptian' });
      await expect(progress(screen, 8, TOTAL_ARABIC)).toBeVisible();
      await answer(screen, { choose: '1 module' });
      await answer(screen, { choose: '2 topics' });
      await answer(screen, 'skip');
      await screen.getByRole('button', 'Generate').tap();

      await expect(screen.getByText('Module 1')).toBeVisible({ timeout: 20_000 });
      expect(api.runs[0].inputs).toMatchObject({ language: 'Arabic', dialect: 'Egyptian' });
      // A right-to-left document is not offered as PDF
      await screen.getByRole('button', 'Export').tap();
      await expect(screen.getByText('Curriculum Outline (DOCX)')).toBeVisible();
      await expect(screen.getByText('Production Script (PDF)')).toHaveCount(0);
    });

    // The questions come back translated, so a language switch refetches the
    // tool. That refetch must not cost the reader their answers or their place.
    test('switching the site to Arabic keeps every answer and the place', async ({ app, screen, browser }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      // Engagement Style skipped, so the place is more than "the first gap"
      await answerAll(screen, [...ANSWERS.slice(0, 5), 'skip'], TOTAL);

      await switchToArabic(screen);
      await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
      await expect(progress(screen, 6, TOTAL)).toBeVisible();
      await expect(screen.getByText(COURSE.title)).toBeVisible();
      await expect(screen.getByText(COURSE.goal)).toBeVisible();
      await expect(screen.getByText('20 – 30')).toBeVisible();
      await expect(screen.getByText('تم التخطي')).toBeVisible();

      // The flow carries on in Arabic, and the run gets the answers from before
      await answer(screen, { choose: 'الإنجليزية' });
      await answer(screen, { choose: 'وحدة' });
      await answer(screen, { choose: 'موضوعان' });
      await screen.getByRole('button', 'تخطي').tap();
      await screen.getByRole('button', 'إنشاء').tap();

      await expect(screen.getByText('Video three: block time on the calendar.')).toBeVisible({ timeout: 20_000 });
      expect(api.runs[0].inputs).toMatchObject({
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

      await screen.getByPlaceholder(PLACEHOLDER.notes).fill('Keep every video under three minutes');
      await screen.getByRole('button', 'Generate').tap();
      await expect(screen.getByText('Module 1')).toBeVisible({ timeout: 20_000 });

      expect(api.runs[0].inputs).toMatchObject({
        referenceLink: UPLOADED_FILE_URL,
        notes: 'Keep every video under three minutes'
      });
    });

    // The model walks the whole questionnaire. Each goal is pinned by the
    // counter it moves, so every step records on its first passing run and
    // replays on the next without a model call.
    test('the agent answers every question and generates', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      const title = `${COURSE.title} ${Date.now()}`;

      const basics = await agent.act(
        'answer Course Title with {title}, Learning Goal with {goal} and Target Audience with {audience}',
        { params: { title: unique(title), goal: COURSE.goal, audience: COURSE.audience } }
      );
      await expect(progress(screen, 3, TOTAL)).toBeVisible();
      await expect(screen.getByText(title)).toBeVisible();
      expectCacheOutcome(basics);

      const ages = await agent.act('set the age range from {from} to {to} years and continue', { params: { from: '20', to: '30' } });
      await expect(progress(screen, 4, TOTAL)).toBeVisible();
      await expect(screen.getByText('20 – 30')).toBeVisible();
      expectCacheOutcome(ages);

      const choices = await agent.act('choose {level}, then {style}, then {language}', {
        params: { level: 'Beginner', style: 'Practical', language: 'English' }
      });
      await expect(progress(screen, 7, TOTAL)).toBeVisible();
      expectCacheOutcome(choices);

      const size = await agent.act('choose {modules} and then {topics}', { params: { modules: '1 module', topics: '2 topics' } });
      await expect(progress(screen, 9, TOTAL)).toBeVisible();
      expectCacheOutcome(size);

      const run = await agent.act('skip the Reference File question, then click Generate');
      await expect(screen.getByText('Module 1')).toBeVisible({ timeout: 30_000 });
      expectCacheOutcome(run);

      expect(api.runs).toHaveLength(1);
      expect(api.runs[0].inputs).toMatchObject({
        courseTitle: title,
        ageMin: '20',
        ageMax: '30',
        knowledgeLevel: 'Beginner',
        language: 'English',
        numberOfModules: '1',
        numberOfTopics: '2'
      });
    });
  }
);
