import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { blockVideoRenders, mockUpload, mockVideoApi, UPLOADED_AUDIO_URL } from '../../helpers/tool-api.ts';
import { pickPresenterAndVoice } from '../../helpers/video-picker.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { expectCacheOutcome } from '../../helpers/agent.ts';
import { JOB_ID, ROUTE, ROUTES, SCRIPT, TOOL_NAME, TOOL_NAME_AR } from './fixture.ts';

describe('video ai generator: intake', { tags: ['tools', 'video-ai-generator'], session: 'member', timeout: 180_000 }, () => {
  test('opens on three ways to start, with what every route gives', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await app.open(ROUTE);

    await expect(screen.getByRole('heading', TOOL_NAME)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('How would you like to create your video?')).toBeVisible();
    await expect(screen.getByRole('button', ROUTES.write)).toBeVisible();
    await expect(screen.getByRole('button', ROUTES.ai)).toBeVisible();
    await expect(screen.getByRole('button', ROUTES.audio)).toBeVisible();
    await expect(screen.getByText('Recommended')).toBeVisible();
    await expect(screen.getByText('presenters')).toBeVisible();
    await expect(screen.getByText('voices')).toBeVisible();
  });

  test('Generate with AI hands over to the Video Script Agent', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await app.open(ROUTE);

    await screen.getByRole('button', ROUTES.ai).tap();
    await expect(browser).toHaveURL('/tools/single-video-script-tool/2', { timeout: 20_000 });
  });

  test('a script needs ten characters before Continue, and Back returns to the routes', async ({ app, screen, browser }) => {
    await mockVideoApi(browser, { started: JOB_ID });
    await app.open(ROUTE);
    await screen.getByRole('button', ROUTES.write).tap();

    const script = screen.getByRole('textbox', 'Script');
    const next = screen.getByRole('button', 'Continue');
    await expect(screen.getByText('Enter Your Script')).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(screen.getByText('0/25,000')).toBeVisible();

    await script.fill('Too short');
    await expect(next).toBeDisabled();
    await script.fill(SCRIPT);
    await expect(next).toBeEnabled();
    await expect(screen.getByText(`${SCRIPT.length}/25,000`)).toBeVisible();

    // The mode screen's own Back, not the page's (which leaves the tool)
    await browser.locator('button.header-back-btn').tap();
    await expect(screen.getByText('How would you like to create your video?')).toBeVisible();
  });

  test('a script too long to speak in thirty minutes is refused', async ({ app, screen, browser }) => {
    await mockVideoApi(browser, { started: JOB_ID }, { estimatedSeconds: 31 * 60 });
    await app.open(ROUTE);
    await screen.getByRole('button', ROUTES.write).tap();

    await screen.getByRole('textbox', 'Script').fill(SCRIPT);
    await screen.getByRole('textbox', 'Script').press('Tab');

    await expect(screen.getByText('Estimated script duration cannot exceed 30 minutes')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
  });

  test('Continue opens the presenter picker on the script', async ({ app, screen, browser }) => {
    const video = await mockVideoApi(browser, { started: JOB_ID });
    await app.open(ROUTE);
    await screen.getByRole('button', ROUTES.write).tap();
    await screen.getByRole('textbox', 'Script').fill(SCRIPT);
    await screen.getByRole('button', 'Continue').tap();

    const dialog = screen.getByRole('dialog');
    await expect(dialog.getByText('Create Video Avatar')).toBeVisible();
    await dialog.getByRole('button', 'Cancel').tap();
    await expect(screen.getByRole('dialog')).toHaveCount(0);
    // Cancelling is free, and the script is still there
    expect(video.jobs).toHaveLength(0);
    await expect(screen.getByRole('textbox', 'Script')).toHaveValue(SCRIPT);
  });

  test('uploaded audio is the voice: the picker asks only for a presenter', async ({ app, screen, browser }) => {
    await mockUpload(browser);
    const video = await mockVideoApi(browser, { started: JOB_ID });
    await app.open(ROUTE);
    await screen.getByRole('button', ROUTES.audio).tap();

    await expect(screen.getByText('Upload Your Audio')).toBeVisible();
    await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
    await browser.locator('#audio-upload-input').setInputFiles(['tests/fixtures/narration.wav']);
    await expect(screen.getByText('Uploaded successfully', { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('narration.wav')).toBeVisible();

    await screen.getByRole('button', 'Continue').tap();
    await pickPresenterAndVoice(screen, browser, { voice: false });

    await expect.poll(() => video.jobs.length, { timeout: 20_000 }).toBe(1);
    expect(video.jobs[0]).toMatchObject({ toolId: 5, audioUrl: UPLOADED_AUDIO_URL, script: null, voiceName: null });
  });

  test('a removed recording takes Continue away again', async ({ app, screen, browser }) => {
    await mockUpload(browser);
    await mockVideoApi(browser, { started: JOB_ID });
    await app.open(ROUTE);
    await screen.getByRole('button', ROUTES.audio).tap();
    await browser.locator('#audio-upload-input').setInputFiles(['tests/fixtures/narration.wav']);
    await expect(screen.getByText('Uploaded successfully', { exact: false })).toBeVisible({ timeout: 20_000 });

    await browser.locator('button.remove-audio-btn').tap();
    await expect(screen.getByText('Click to upload or drag and drop')).toBeVisible();
    await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
  });

  test('the agent writes a script and reaches the presenter picker', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
    await mockVideoApi(browser, { started: JOB_ID });
    await app.open(ROUTE);

    expectCacheOutcome(await agent.act('choose Write Your Script, type {script} as the script, then press Continue', { params: { script: SCRIPT } }));
    await expect(screen.getByRole('dialog').getByText('Create Video Avatar')).toBeVisible({ timeout: 20_000 });
  });

  test('switching the site to Arabic keeps the script being written', async ({ app, screen, browser }) => {
    await mockVideoApi(browser, { started: JOB_ID });
    await app.open(ROUTE);
    await screen.getByRole('button', ROUTES.write).tap();
    await screen.getByRole('textbox', 'Script').fill(SCRIPT);

    await switchToArabic(screen);
    await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByDisplayValue(SCRIPT)).toBeVisible();
  });
});
