import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { blockVideoRenders, mockToolApi, mockVideoApi } from '../../helpers/tool-api.ts';
import { answerAll } from '../../helpers/questionnaire.ts';
import { pickPresenterAndVoice } from '../../helpers/video-picker.ts';
import { ANSWERS, ENDPOINT, OUTPUT, ROUTE, TOTAL } from './fixture.ts';

/**
 * Turning the script into a video, from the panel under it.
 *
 * Every video call is stubbed (`mockVideoApi`) and anything else that tries to
 * start a render is aborted (`blockVideoRenders`): a real job renders a video
 * and spends the account's credits.
 */

const VIDEO_AI_GENERATOR_ID = 5;

/** Each test's own `mockVideoApi` answers the video calls; it has to be registered after the guard. */
async function scriptReady(app: App, screen: Screen, browser: Browser) {
  await mockToolApi(browser, ENDPOINT, OUTPUT);
  await app.open(ROUTE);
  await answerAll(screen, ANSWERS, TOTAL);
  await screen.getByRole('button', 'Generate').tap();
  await expect(screen.getByRole('button', 'Generate a video')).toBeEnabled({ timeout: 20_000 });
}

describe('single video script: video', { tags: ['tools', 'single-video-script', 'video'], session: 'member', timeout: 180_000 }, () => {
  test('the script offers a video, and the picker opens on presenters', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    const video = await mockVideoApi(browser, { started: 4242 });
    await scriptReady(app, screen, browser);

    await expect(screen.getByText('Turn this script into a video')).toBeVisible();
    await screen.getByRole('button', 'Generate a video').tap();

    const dialog = screen.getByRole('dialog');
    await expect(dialog.getByText('Create Video Avatar')).toBeVisible();
    await expect(dialog.getByRole('button', /Next/)).toBeDisabled();

    // Cancelling is free: nothing is started
    await dialog.getByRole('button', 'Cancel').tap();
    await expect(screen.getByRole('dialog')).toHaveCount(0);
    expect(video.jobs).toHaveLength(0);
  });

  test('a started video hands over to the video generator with its job', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    const video = await mockVideoApi(browser, { started: 4242 });
    await scriptReady(app, screen, browser);

    await screen.getByRole('button', 'Generate a video').tap();
    await pickPresenterAndVoice(screen, browser);

    await expect(browser).toHaveURL(new RegExp(`/tools/video-ai-generator/${VIDEO_AI_GENERATOR_ID}\\?jobId=4242`), { timeout: 20_000 });
    expect(video.jobs).toHaveLength(1);
    expect(video.jobs[0]).toMatchObject({
      toolId: VIDEO_AI_GENERATOR_ID,
      script: OUTPUT.script,
      estimatedDurationSeconds: 45
    });
    expect(video.jobs[0].avatarName).toBeTruthy();
    expect(video.jobs[0].voiceName).toBeTruthy();
  });

  // The failure is put in front of the reader: the Video tab opens on it. It
  // used to appear only as a new tab beside the script the reader was on.
  test('a refused video opens the Video tab on the failure, and Try Again reopens the picker', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoApi(browser, { refused: 'Video rendering is paused for maintenance.' });
    await scriptReady(app, screen, browser);

    await screen.getByRole('button', 'Generate a video').tap();
    await pickPresenterAndVoice(screen, browser);

    await expect(screen.getByRole('tab', 'Video')).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
    await expect(screen.getByText('Video Generation Unavailable')).toBeVisible();
    await expect(screen.getByText('Video rendering is paused for maintenance.')).toBeVisible();
    await screen.getByRole('button', 'Try Again').tap();
    await expect(screen.getByRole('dialog').getByText('Create Video Avatar')).toBeVisible();
  });

  // A server error set only the friendly message, which on its own does not
  // even make the Video tab appear: the failure showed nowhere at all.
  test('a video the server fails to start still shows its failure', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoApi(browser, { httpStatus: 500 });
    await scriptReady(app, screen, browser);

    await screen.getByRole('button', 'Generate a video').tap();
    await pickPresenterAndVoice(screen, browser);

    await expect(screen.getByRole('tab', 'Video')).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
    await expect(screen.getByText('The server is busy right now. Please try again later.')).toBeVisible();
    await expect(screen.getByRole('button', 'Try Again')).toBeVisible();
  });

  test('a video the plan cannot pay for offers an upgrade', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoApi(browser, { errorType: 'InsufficientCredits' });
    await scriptReady(app, screen, browser);

    await screen.getByRole('button', 'Generate a video').tap();
    await pickPresenterAndVoice(screen, browser);

    await expect(screen.getByRole('dialog').getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
    await screen.getByRole('dialog').getByRole('button', 'Maybe Later').tap();
    // Nothing is left spinning: the reader can pick again
    await expect(screen.getByRole('button', 'Generate a video')).toBeEnabled();
  });
});
