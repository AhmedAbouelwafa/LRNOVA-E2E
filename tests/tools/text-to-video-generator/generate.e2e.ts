import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { EXPLAINER_URL, mockTextVideoApi, type TextVideoApiOptions } from '../../helpers/text-video-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { ANSWERS, PLACEHOLDER, REQUEST, ROUTE, savedJob, STORYBOARD, TAB, TOTAL, VIDEO } from './fixture.ts';

const JOB_ID = 5151;
const FAILED_TITLE = 'Video Generation Failed';
const STORYBOARD_FAILED = 'Storyboard generation failed. Please try again.';
const RENDER_FAILED = 'Video generation failed. Please check your description and try again.';
const [SCENE_1, SCENE_2] = STORYBOARD.scenes;

/** Answers every question and presses Generate; stage 1 answers with `options.storyboard` (the fixture's unless said otherwise). */
async function generate(app: App, screen: Screen, browser: Browser, options: TextVideoApiOptions = {}) {
  const api = await mockTextVideoApi(browser, { storyboard: STORYBOARD, jobId: JOB_ID, ...options });
  await app.open(ROUTE);
  await answerAll(screen, ANSWERS, TOTAL);
  await screen.getByRole('button', 'Generate').tap();
  return api;
}

async function expectStoryboard(screen: Screen) {
  await expect(screen.getByText('Review your storyboard')).toBeVisible({ timeout: 20_000 });
  await expect(screen.getByText(SCENE_1.narration)).toBeVisible();
}

/** Stage 1 done, then the storyboard's own Generate video. */
async function render(app: App, screen: Screen, browser: Browser, options: TextVideoApiOptions = {}) {
  const api = await generate(app, screen, browser, options);
  await expectStoryboard(screen);
  await screen.getByRole('button', /Generate video/).tap();
  return api;
}

async function expectVideo(screen: Screen, browser: Browser) {
  await expect(screen.getByRole('tab', TAB.video)).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
  await expect(browser.locator('video.result-video')).toHaveAttribute('src', EXPLAINER_URL);
  await expect(screen.getByRole('link', /Open video in new tab/)).toHaveAttribute('href', EXPLAINER_URL);
}

describe('text to video: generate', { tags: ['tools', 'text-to-video-generator'], session: 'member', timeout: 180_000 }, () => {
  // ── Stage 1: the storyboard ────────────────────────────────────────────

  test('Generate writes a storyboard from the answers, and spends nothing yet', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser);

    await expectStoryboard(screen);
    await expect(screen.getByText(`“${STORYBOARD.title}”`)).toBeVisible();
    await expect(screen.getByRole('button', 'Scene 3 of 3')).toBeVisible();
    await expect(screen.getByText(SCENE_1.visualDescription)).toBeVisible();
    await expect(screen.getByText('Untitled')).toBeVisible();
    await expect(browser).toHaveURL(`${ROUTE}/${JOB_ID}`);

    expect(api.storyboards).toHaveLength(1);
    expect(api.storyboards[0]).toMatchObject(REQUEST);
    expect(api.renders).toHaveLength(0);
  });

  test('the storyboard is written behind a loader', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser, { hold: true });

    await expect(screen.getByText('Generating your storyboard...')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByRole('button', 'Generate')).toHaveCount(0);
    api.release();
    await expectStoryboard(screen);
  });

  test('a style and a voice picked in their popups are what the storyboard is asked for', async ({ app, screen, browser }) => {
    const api = await mockTextVideoApi(browser, { storyboard: STORYBOARD, jobId: JOB_ID });
    await app.open(ROUTE);
    await answerAll(screen, ANSWERS.slice(0, 4), TOTAL);

    await browser.locator('.ttv-picker').tap();
    await screen.getByRole('dialog').getByRole('button', /Cartoon/).tap();
    await screen.getByRole('dialog').getByRole('button', 'Confirm').tap();
    await screen.getByRole('button', 'Continue').tap();

    await browser.locator('.ttv-picker').tap();
    await browser.locator('.vp-voice-card:not(.is-selected)').first().tap();
    await screen.getByRole('dialog').getByRole('button', 'Confirm').tap();
    await screen.getByRole('button', 'Continue').tap();

    await answerAll(screen, ANSWERS.slice(6), TOTAL, 6);
    await screen.getByRole('button', 'Generate').tap();
    await expectStoryboard(screen);

    expect(api.storyboards[0]).toMatchObject({ style: 'cartoon' });
    expect(api.storyboards[0].voice).toBeTruthy();
    expect(api.storyboards[0].voice).not.toBe(REQUEST.voice);
  });

  test('scenes are browsed from the timeline', async ({ app, screen, browser }) => {
    await generate(app, screen, browser);
    await expectStoryboard(screen);

    await screen.getByRole('button', 'Scene 2 of 3').tap();
    await expect(screen.getByText(SCENE_2.narration)).toBeVisible();
    await expect(screen.getByText(SCENE_2.visualDescription)).toBeVisible();
    await expect(screen.getByText(SCENE_1.narration)).toHaveCount(0);
  });

  test('an edited scene is saved, and the video is made from the edit', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser, { status: 'Pending' });
    await expectStoryboard(screen);
    const edited = 'Every good answer starts with a pause to listen.';

    await browser.locator('button.sb__btn--edit').tap();
    // No run from unsaved text
    await expect(screen.getByRole('button', /Generate video/)).toHaveCount(0);
    await browser.locator('.scene-editor__textarea--narration').fill(edited);
    await screen.getByRole('button', /Save changes/).tap();

    await expect(screen.getByText(edited)).toBeVisible();
    expect(api.saves).toHaveLength(1);
    expect(api.saves[0].jobId).toBe(JOB_ID);
    expect(api.saves[0].storyboard.scenes[0].narration).toBe(edited);

    await screen.getByRole('button', /Generate video/).tap();
    await expect.poll(() => api.renders.length, { timeout: 20_000 }).toBe(1);
    expect(api.renders[0].jobId).toBe(JOB_ID);
    expect(api.renders[0].storyboard.scenes[0].narration).toBe(edited);
    expect(api.renders[0].storyboard.scenes[1].narration).toBe(SCENE_2.narration);
  });

  test('Cancel throws an edit away', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser);
    await expectStoryboard(screen);

    await browser.locator('button.sb__btn--edit').tap();
    await browser.locator('.scene-editor__textarea--narration').fill('An edit nobody keeps.');
    await browser.locator('button.sb__btn--ghost').tap();

    await expect(screen.getByText(SCENE_1.narration)).toBeVisible();
    await expect(screen.getByText('An edit nobody keeps.')).toHaveCount(0);
    expect(api.saves).toHaveLength(0);
  });

  test('a storyboard edit the server refuses says so, and stays open to try again', async ({ app, screen, browser }) => {
    await generate(app, screen, browser, { saveRefused: true });
    await expectStoryboard(screen);

    await browser.locator('button.sb__btn--edit').tap();
    await browser.locator('.scene-editor__textarea--narration').fill('An edit the server refuses.');
    await screen.getByRole('button', /Save changes/).tap();

    await expect(screen.getByText("Couldn't save your changes. Please try again.", { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(browser.locator('.scene-editor__textarea--narration')).toHaveValue('An edit the server refuses.');
  });

  test('a refused storyboard shows the reason', async ({ app, screen, browser }) => {
    await generate(app, screen, browser, { storyboard: { refused: 'The storyboard service is busy.' } });

    await expect(screen.getByText(FAILED_TITLE)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('The storyboard service is busy.')).toBeVisible();
    await expect(screen.getByRole('button', /Try Again/)).toBeVisible();
  });

  test('a server error writing the storyboard is told plainly', async ({ app, screen, browser }) => {
    await generate(app, screen, browser, { storyboard: { httpStatus: 500 } });

    await expect(screen.getByText(STORYBOARD_FAILED)).toBeVisible({ timeout: 20_000 });
    await expect(browser).toHaveURL(ROUTE);
  });

  test('a storyboard that cannot be read is a failure, not an empty canvas', async ({ app, screen, browser }) => {
    await generate(app, screen, browser, { storyboard: { unreadable: true } });

    await expect(screen.getByText(STORYBOARD_FAILED)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('Review your storyboard')).toHaveCount(0);
  });

  test('Try Again after a failed storyboard asks again with the same answers', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser, { storyboard: { httpStatus: 500 } });
    await expect(screen.getByText(STORYBOARD_FAILED)).toBeVisible({ timeout: 20_000 });

    await screen.getByRole('button', /Try Again/).tap();
    await expect.poll(() => api.storyboards.length, { timeout: 20_000 }).toBe(2);
    expect(api.storyboards[1]).toEqual(api.storyboards[0]);
  });

  test('a storyboard the plan cannot pay for offers an upgrade, and keeps the answers', async ({ app, screen, browser }) => {
    await generate(app, screen, browser, { storyboard: { errorType: 'InsufficientCredits' } });

    const dialog = screen.getByRole('dialog');
    await expect(dialog.getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', 'Maybe Later').tap();
    await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    await expect(progress(screen, ANSWERS.length, TOTAL)).toBeVisible();
    await expect(screen.getByText(VIDEO.prompt)).toBeVisible();
  });

  test('switching the site to Arabic keeps the storyboard on screen', async ({ app, screen, browser }) => {
    await generate(app, screen, browser);
    await expectStoryboard(screen);

    await switchToArabic(screen);
    await expect(screen.getByText('راجع مخطط الفيديو')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(SCENE_1.narration)).toBeVisible();
    await expect(screen.getByRole('tab', TAB.storyboardAr)).toBeVisible();
  });

  // ── Stage 2: the video ─────────────────────────────────────────────────

  test('Generate video renders the storyboard and shows the player', async ({ app, screen, browser }) => {
    const api = await render(app, screen, browser, { status: 'Completed' });

    await expectVideo(screen, browser);
    expect(api.renders).toHaveLength(1);
    expect(api.renders[0]).toEqual({ jobId: JOB_ID, storyboard: STORYBOARD });

    // The storyboard is now a record of what was made
    await screen.getByRole('tab', TAB.storyboard).tap();
    await expect(screen.getByText('Video generated')).toBeVisible();
    await expect(screen.getByRole('button', /Generate video/)).toHaveCount(0);
    await screen.getByRole('button', /View video/).tap();
    await expect(screen.getByRole('tab', TAB.video)).toHaveAttribute('aria-selected', 'true');
  });

  test('a render still running holds the Video tab on its loader', async ({ app, screen, browser }) => {
    await render(app, screen, browser, { status: 'Pending' });

    await expect(screen.getByRole('tab', TAB.video)).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
    await expect(browser.locator('app-text-to-video-generator-result app-content-loader')).toBeVisible();
    await expect(screen.getByText(FAILED_TITLE)).toHaveCount(0);
  });

  test('a failed render shows the reason the job gave', async ({ app, screen, browser }) => {
    await render(app, screen, browser, { status: 'Failed', errorMessage: 'The narration could not be voiced.' });

    await expect(screen.getByText(FAILED_TITLE)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('The narration could not be voiced.')).toBeVisible();
    await expect(screen.getByRole('button', /Try Again/)).toBeVisible();
  });

  test('a server error starting the render says so', async ({ app, screen, browser }) => {
    await render(app, screen, browser, { render: { httpStatus: 500 } });

    await expect(screen.getByText(RENDER_FAILED)).toBeVisible({ timeout: 20_000 });
  });

  test('a render the plan cannot pay for offers an upgrade, and the storyboard waits', async ({ app, screen, browser }) => {
    await render(app, screen, browser, { render: { errorType: 'InsufficientCredits' } });

    const dialog = screen.getByRole('dialog');
    await expect(dialog.getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', 'Maybe Later').tap();
    await expect(screen.getByRole('tab', TAB.storyboard)).toHaveAttribute('aria-selected', 'true');
    await expect(screen.getByRole('button', /Generate video/)).toBeEnabled();
  });

  // The finished video offers starting over and the download, nothing else:
  // the button that used to wipe every answer was labelled Regenerate.
  test('Create New Video starts over from an empty first question', async ({ app, screen, browser }) => {
    await render(app, screen, browser, { status: 'Completed' });
    await expectVideo(screen, browser);

    await expect(screen.getByRole('button', /Create New Video/)).toBeVisible();
    await expect(screen.getByRole('button', /Download/)).toBeVisible();
    await expect(browser.locator('.result-header button')).toHaveCount(2);

    await browser.locator('button.new-video-btn').tap();
    await expect(screen.getByText('Question 1/10')).toBeVisible({ timeout: 20_000 });
    await expect(progress(screen, 0, TOTAL)).toBeVisible();
    await expect(screen.getByPlaceholder(PLACEHOLDER.prompt)).toHaveValue('');
    await expect(browser).toHaveURL(ROUTE);
  });

  // ── The title ──────────────────────────────────────────────────────────

  test('renaming the video saves the new title', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser);
    await expectStoryboard(screen);

    await screen.getByText('Untitled').tap();
    await screen.getByDisplayValue('Untitled').fill('Listening Explainer');
    await screen.getByDisplayValue('Listening Explainer').press('Enter');

    await expect(screen.getByText('Listening Explainer')).toBeVisible();
    await expect(screen.getByDisplayValue('Listening Explainer')).toHaveCount(0);
    expect(api.renames).toEqual([{ jobId: JOB_ID, name: 'Listening Explainer' }]);
  });

  // A refused rename left the editor open with nothing said: no reason, and
  // no sign the title was not saved.
  test('a refused rename says why', async ({ app, screen, browser }) => {
    await generate(app, screen, browser, { renameRefused: 'That title is already taken.' });
    await expectStoryboard(screen);

    await screen.getByText('Untitled').tap();
    await screen.getByDisplayValue('Untitled').fill('Listening Explainer');
    await screen.getByDisplayValue('Listening Explainer').press('Enter');

    await expect(screen.getByText('That title is already taken.')).toBeVisible({ timeout: 20_000 });
  });

  // ── A job opened from My Projects ──────────────────────────────────────

  test('a saved storyboard opens for review, with its answers, and renders that job', async ({ app, screen, browser }) => {
    const api = await mockTextVideoApi(browser, { job: savedJob('StoryboardCompleted'), status: 'Pending' });
    await app.open(`${ROUTE}/777`);

    await expectStoryboard(screen);
    await expect(screen.getByText('Saved Explainer')).toBeVisible();
    await expect(screen.getByText(VIDEO.prompt)).toBeVisible();
    await expect(screen.getByText('Whiteboard')).toBeVisible();

    await screen.getByRole('button', /Generate video/).tap();
    await expect.poll(() => api.renders.length, { timeout: 20_000 }).toBe(1);
    expect(api.renders[0].jobId).toBe(777);
  });

  test('a finished job opens straight onto its video', async ({ app, screen, browser }) => {
    await mockTextVideoApi(browser, { job: savedJob('Completed') });
    await app.open(`${ROUTE}/777`);

    await expectVideo(screen, browser);
    await expect(screen.getByText('Saved Explainer')).toBeVisible();
  });

  test('a job still rendering is polled at once and picks up the video', async ({ app, screen, browser }) => {
    await mockTextVideoApi(browser, { job: savedJob('Pending'), status: 'Completed' });
    await app.open(`${ROUTE}/777`);

    await expectVideo(screen, browser);
  });

  test('a failed job opens on its failure, with the reason it gave', async ({ app, screen, browser }) => {
    await mockTextVideoApi(browser, { job: savedJob('Failed') });
    await app.open(`${ROUTE}/777`);

    await expect(screen.getByText(FAILED_TITLE)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('The narration could not be voiced.')).toBeVisible();
  });

  // A job that could not be fetched was reported as a failed video render, and
  // Try Again "regenerated" from the empty form behind it, which did nothing.
  test('a job that cannot be opened says so, and Try Again fetches it again', async ({ app, screen, browser }) => {
    const api = await mockTextVideoApi(browser, {});
    await app.open(`${ROUTE}/778`);

    await expect(screen.getByText("Couldn't Open This Video")).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText("We couldn't open this project. Please try again.")).toBeVisible();
    await expect(screen.getByText(FAILED_TITLE)).toHaveCount(0);
    await expect(screen.getByText(RENDER_FAILED)).toHaveCount(0);

    await screen.getByRole('button', /Try Again/).tap();
    await expect.poll(() => api.loads.length, { timeout: 20_000 }).toBe(2);
    expect(api.loads).toEqual([778, 778]);
    expect(api.storyboards).toHaveLength(0);
  });
});
