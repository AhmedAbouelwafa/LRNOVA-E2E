import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { blockVideoRenders, mockVideoApi, mockVideoJob, mockVideoRename, VIDEO_URL, type VideoJobStatus } from '../../helpers/tool-api.ts';
import { pickPresenterAndVoice } from '../../helpers/video-picker.ts';
import { JOB_ID, ROUTE, ROUTES, SCRIPT, TOOL_ID } from './fixture.ts';

const FAILED_TITLE = 'Video Generation Unavailable';
const SERVER_BUSY = 'The server is busy right now. Please try again later.';

/** Writes the script, picks a presenter and a voice, and starts the (stubbed) render. */
async function startVideo(app: App, screen: Screen, browser: Browser) {
  await app.open(ROUTE);
  await screen.getByRole('button', ROUTES.write).tap();
  await screen.getByRole('textbox', 'Script').fill(SCRIPT);
  await screen.getByRole('button', 'Continue').tap();
  await pickPresenterAndVoice(screen, browser);
}

/** The finished video's panel: the player and its actions. */
async function expectVideo(screen: Screen, browser: Browser) {
  await expect(screen.getByText('Preview')).toBeVisible({ timeout: 20_000 });
  await expect(browser.locator('video.video-player')).toHaveAttribute('src', VIDEO_URL);
  await expect(screen.getByRole('button', /Edit video/)).toBeVisible();
  await expect(screen.getByRole('link', /Open video in new tab/)).toHaveAttribute('href', VIDEO_URL);
}

describe('video ai generator: generate', { tags: ['tools', 'video-ai-generator'], session: 'member', timeout: 180_000 }, () => {
  test('a finished render shows the video, made from the script and the picks', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    const video = await mockVideoApi(browser, { started: JOB_ID }, { status: 'Completed' });
    await startVideo(app, screen, browser);

    await expectVideo(screen, browser);
    // The questions step aside once there is a video
    await expect(screen.getByRole('textbox', 'Script')).toHaveCount(0);
    await expect(screen.getByText('Untitled')).toBeVisible();

    expect(video.jobs).toHaveLength(1);
    expect(video.jobs[0]).toMatchObject({ toolId: TOOL_ID, script: SCRIPT, audioUrl: null, videoGenerationType: 'low_model', estimatedDurationSeconds: 45 });
    expect(video.jobs[0].avatarName).toBeTruthy();
    expect(video.jobs[0].voiceName).toBeTruthy();
  });

  test('a render still running holds the canvas on its loader', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoApi(browser, { started: JOB_ID }, { status: 'Pending' });
    await startVideo(app, screen, browser);

    await expect(browser.locator('app-video-result app-content-loader')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(FAILED_TITLE)).toHaveCount(0);
    await expect(screen.getByRole('button', 'Regenerate')).toHaveCount(0);
  });

  test('a failed render says so, and Try Again goes back to the script', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoApi(browser, { started: JOB_ID }, { status: 'Failed' });
    await startVideo(app, screen, browser);

    await expect(screen.getByText(FAILED_TITLE)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(SERVER_BUSY)).toBeVisible();
    await screen.getByRole('button', 'Try Again').tap();

    await expect(screen.getByRole('textbox', 'Script')).toHaveValue(SCRIPT);
    await expect(screen.getByText(FAILED_TITLE)).toHaveCount(0);
  });

  test('a refused render shows the reason', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoApi(browser, { refused: 'Video rendering is paused for maintenance.' });
    await startVideo(app, screen, browser);

    await expect(screen.getByText(FAILED_TITLE)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('Video rendering is paused for maintenance.')).toBeVisible();
    await expect(screen.getByRole('button', 'Try Again')).toBeVisible();
  });

  test('a server error starting the render is told plainly', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoApi(browser, { httpStatus: 500 });
    await startVideo(app, screen, browser);

    await expect(screen.getByText(FAILED_TITLE)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(SERVER_BUSY)).toBeVisible();
  });

  test('a render the plan cannot pay for offers an upgrade, and the script waits', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoApi(browser, { errorType: 'InsufficientCredits' });
    await startVideo(app, screen, browser);

    const dialog = screen.getByRole('dialog');
    await expect(dialog.getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', 'Maybe Later').tap();
    await expect(screen.getByRole('textbox', 'Script')).toHaveValue(SCRIPT);
    await expect(screen.getByRole('button', 'Continue')).toBeEnabled();
  });

  test('Regenerate goes back to the script that made the video', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoApi(browser, { started: JOB_ID }, { status: 'Completed' });
    await startVideo(app, screen, browser);
    await expectVideo(screen, browser);

    await screen.getByRole('button', 'Regenerate').tap();
    await expect(screen.getByRole('textbox', 'Script')).toHaveValue(SCRIPT);
    await expect(screen.getByText('How would you like to create your video?')).toHaveCount(0);
  });

  test('renaming the video saves the new title', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoApi(browser, { started: JOB_ID }, { status: 'Completed' });
    const { renames } = await mockVideoRename(browser);
    await startVideo(app, screen, browser);
    await expectVideo(screen, browser);

    await screen.getByText('Untitled').tap();
    await screen.getByDisplayValue('Untitled').fill('Listening Intro');
    await screen.getByDisplayValue('Listening Intro').press('Enter');

    await expect(screen.getByText('Listening Intro')).toBeVisible();
    expect(renames).toEqual([{ jobId: JOB_ID, name: 'Listening Intro' }]);
  });

  // A refused rename is about the title, not the video: the finished video
  // stays as it is, and nothing claims the generation failed.
  test('a refused rename does not report the video as failed', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoApi(browser, { started: JOB_ID }, { status: 'Completed' });
    await mockVideoRename(browser, 'That title is already taken.');
    await startVideo(app, screen, browser);
    await expectVideo(screen, browser);

    await screen.getByText('Untitled').tap();
    await screen.getByDisplayValue('Untitled').fill('Listening Intro');
    await screen.getByDisplayValue('Listening Intro').press('Enter');

    await expect(screen.getByText('That title is already taken.')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(FAILED_TITLE)).toHaveCount(0);
    await expect(browser.locator('video.video-player')).toBeVisible();
  });

  for (const [status, check] of [
    ['Completed', 'opens straight onto the video'],
    ['Pending', 'opens on the loader and picks up the render'],
    ['Failed', 'opens on the failure, with the reason the job gave']
  ] as [VideoJobStatus, string][]) {
    test(`a ${status.toLowerCase()} job opened from My Projects ${check}`, async ({ app, screen, browser }) => {
      await blockVideoRenders(browser);
      await mockVideoApi(browser, { started: JOB_ID }, { status: 'Completed' });
      await mockVideoJob(browser, { id: 777, status, script: SCRIPT, errorMessage: 'The presenter could not be rendered.' });

      await app.open(`${ROUTE}?jobId=777&jobName=Saved%20Video`);
      // Never the "how would you like to start" question: there is a job
      await expect(screen.getByText('How would you like to create your video?')).toHaveCount(0);

      if (status === 'Failed') {
        await expect(screen.getByText(FAILED_TITLE)).toBeVisible({ timeout: 20_000 });
        await expect(screen.getByText('The presenter could not be rendered.')).toBeVisible();
      } else {
        // A pending job is polled at once; the stub answers Completed
        await expectVideo(screen, browser);
        await expect(screen.getByText('Saved Video')).toBeVisible();
      }
    });
  }

  test('Regenerate on a job opened from My Projects brings its script back', async ({ app, screen, browser }) => {
    await blockVideoRenders(browser);
    await mockVideoJob(browser, { id: 777, status: 'Completed', script: SCRIPT });
    await app.open(`${ROUTE}?jobId=777`);
    await expectVideo(screen, browser);

    await screen.getByRole('button', 'Regenerate').tap();
    await expect(screen.getByRole('textbox', 'Script')).toHaveValue(SCRIPT);
  });
});
