import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockToolApi, mockUpload, UPLOADED_FILE_URL } from '../../helpers/tool-api.ts';
import { progress } from '../../helpers/questionnaire.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { expectCacheOutcome } from '../../helpers/agent.ts';
import { answerIntake, CHOOSE_STYLE, ENDPOINT, NOTEBOOK, NOTEBOOK_CONTEXT, OUTPUT, pickTheme, PLACEHOLDER, ROUTE, STEPS, TOOL_NAME, TOTAL } from './fixture.ts';

describe('notebook agent: intake', { tags: ['tools', 'notebook-agent'], session: 'member', timeout: 180_000 }, () => {
  test('opens on the style, one of eleven questions, with nothing to show yet', async ({ app, screen, browser }) => {
    await mockToolApi(browser, ENDPOINT, OUTPUT);
    await app.open(ROUTE);

    await expect(screen.getByRole('heading', TOOL_NAME)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('Question 1/11')).toBeVisible();
    await expect(progress(screen, 0, TOTAL)).toBeVisible();
    await expect(screen.getByRole('button', CHOOSE_STYLE)).toBeVisible();
    await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
    await expect(screen.getByRole('tab', /^Content/)).toHaveCount(0);
  });

  test('every answer moves the counter, and Extra notes carries Generate', async ({ app, screen, browser }) => {
    const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
    await app.open(ROUTE);

    await answerIntake(screen);
    await expect(screen.getByPlaceholder(PLACEHOLDER.extraNotes)).toBeVisible();
    await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    // The answers so far, as they collapsed
    await expect(screen.getByText(NOTEBOOK.topicTitle)).toBeVisible();
    await expect(screen.getByText('Intermediate')).toBeVisible();
    await expect(screen.getByText('Concise')).toBeVisible();
    await expect(screen.getByText('Watercolor')).toBeVisible();
    await expect(screen.getByText('Cover included')).toBeVisible();
    expect(api.runs).toHaveLength(0);
  });

  test('the topic level is optional, and a required question waits for its answer', async ({ app, screen, browser }) => {
    await mockToolApi(browser, ENDPOINT, OUTPUT);
    await app.open(ROUTE);
    await answerIntake(screen, 3);

    // Topic level: Continue without picking one
    await screen.getByRole('button', 'Continue').tap();
    await expect(progress(screen, 4, TOTAL)).toBeVisible();
    await expect(screen.getByText('Skipped')).toBeVisible();
    // Grade is required
    await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
  });

  test('the detail level is picked from its cards', async ({ app, screen, browser }) => {
    await mockToolApi(browser, ENDPOINT, OUTPUT);
    await app.open(ROUTE);
    await answerIntake(screen, 6);

    await expect(screen.getByRole('radio', /Concise/)).toHaveAttribute('aria-checked', 'true');
    await screen.getByRole('radio', /Extensive/).tap();
    await expect(screen.getByRole('radio', /Extensive/)).toHaveAttribute('aria-checked', 'true');
    await screen.getByRole('button', 'Continue').tap();
    await expect(screen.getByText('Extensive')).toBeVisible();
  });

  test('the style is required, and Cancel in its popup keeps none', async ({ app, screen, browser }) => {
    await mockToolApi(browser, ENDPOINT, OUTPUT);
    await app.open(ROUTE);
    await expect(screen.getByRole('button', CHOOSE_STYLE)).toBeVisible({ timeout: 20_000 });

    await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
    await screen.getByRole('button', CHOOSE_STYLE).tap();
    await screen.getByRole('dialog').getByRole('button', /^3D Cartoon/).tap();
    await screen.getByRole('dialog').getByRole('button', 'Cancel').tap();
    await expect(screen.getByRole('button', 'Continue')).toBeDisabled();

    await pickTheme(screen, 'Hand-drawn');
    await expect(screen.getByRole('button', 'Continue')).toBeEnabled();
  });

  test('a reference file is uploaded and sent with the run', async ({ app, screen, browser }) => {
    await mockUpload(browser);
    const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
    await app.open(ROUTE);
    await answerIntake(screen, STEPS.length - 1);

    // Picking the file moves on by itself, as in the other tools
    await browser.locator('input[type="file"]').setInputFiles(['tests/fixtures/reference.txt']);
    await expect(screen.getByText('Uploaded successfully', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('reference.txt')).toBeVisible();

    await screen.getByRole('button', 'Generate').tap();
    await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(1);
    expect(api.runs[0].inputs.referenceLink).toBe(UPLOADED_FILE_URL);
  });

  test('the ✕ on the uploaded reference file removes it, and no referenceLink goes out', async ({ app, screen, browser }) => {
    await mockUpload(browser);
    const api = await mockToolApi(browser, ENDPOINT, OUTPUT);
    await app.open(ROUTE);
    await answerIntake(screen, STEPS.length - 1);

    await browser.locator('input[type="file"]').setInputFiles(['tests/fixtures/reference.txt']);
    await expect(screen.getByText('Uploaded successfully', { exact: false }).first()).toBeVisible({ timeout: 20_000 });

    // One click on the collapsed step drops the file and reopens its dropzone
    await screen.getByRole('button', 'Remove reference.txt').tap();
    await expect(screen.getByRole('button', 'Remove reference.txt')).toHaveCount(0);
    await expect(screen.getByText('PDF, Word or TXT · max 10MB')).toBeVisible();

    await screen.getByRole('button', 'Skip').tap();
    await screen.getByRole('button', 'Generate').tap();
    await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(1);
    expect(api.runs[0].inputs.referenceLink).toBe('');
  });

  test('switching the site to Arabic keeps the answers given', async ({ app, screen, browser }) => {
    await mockToolApi(browser, ENDPOINT, OUTPUT);
    await app.open(ROUTE);
    await answerIntake(screen, 5);

    await switchToArabic(screen);
    await expect(screen.getByText('متوسط')).toBeVisible({ timeout: 20_000 }); // Intermediate
    await expect(progress(screen, 5, TOTAL)).toBeVisible();
    await expect(screen.getByText(NOTEBOOK.subject)).toBeVisible();
    await expect(screen.getByText(NOTEBOOK.grade)).toBeVisible();
  });

  test(
    'the agent answers the subject and moves on',
    { tags: ['agent'], agentContext: NOTEBOOK_CONTEXT },
    async ({ app, screen, browser, agent }) => {
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      await app.open(ROUTE);
      await answerIntake(screen, 1);
      await expect(screen.getByPlaceholder(PLACEHOLDER.subject)).toBeVisible({ timeout: 20_000 });

      expectCacheOutcome(await agent.act('answer the Subject with {subject}, then press Continue', { params: { subject: NOTEBOOK.subject } }));
      await expect(progress(screen, 2, TOTAL)).toBeVisible();
      await expect(screen.getByText(NOTEBOOK.subject)).toBeVisible();
    }
  );
});
