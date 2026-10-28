import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { linkedVideo, type CourseVideoApiOptions } from '../helpers/course-video-api.ts';
import {
  choosePresenter,
  COURSE,
  courseDialog,
  generateButton,
  head,
  jobName,
  LABEL,
  MENU,
  openCourseScript,
  SCRIPT,
  SEGMENTS,
  SOURCE
} from './fixture.ts';

const ACCEPTED = 'Your video is being generated';
const PENDING_NOTE = 'A video request for this part is still being confirmed.';

/** Opens the course script and the avatar dialog for Video 3. */
async function openAvatarDialog(app: App, screen: Screen, browser: Browser, options: CourseVideoApiOptions = {}) {
  const mocks = await openCourseScript(app, screen, browser, options);
  await generateButton(screen, browser, 3).tap();
  await screen.getByRole('menuitem', MENU.avatar).tap();
  const dialog = courseDialog(screen, LABEL.video3);
  await expect(dialog).toBeVisible();
  return { ...mocks, dialog };
}

/** Picks a presenter and sends the video. */
async function send(dialog: Screen, browser: Browser) {
  await choosePresenter(dialog, browser);
  await dialog.getByRole('button', 'Generate video').tap();
}

describe('course videos: avatar video', { tags: ['course-videos', 'full-course-script'], session: 'member', timeout: 180_000 }, () => {
  test('the dialog shows the part, its course and its saved script', async ({ app, screen, browser }) => {
    const { dialog } = await openAvatarDialog(app, screen, browser);

    await expect(dialog.getByText('Avatar Video')).toBeVisible();
    await expect(dialog.getByText(COURSE.title)).toBeVisible();
    await expect(dialog.getByLabel('Script')).toHaveValue(SCRIPT.video3);
    await expect(dialog.getByText('Not chosen yet')).toBeVisible();
    // Priced from the script before anything is sent
    await expect(dialog.getByText(/^Estimated length/)).toBeVisible({ timeout: 20_000 });
    // No presenter, no video
    await expect(dialog.getByRole('button', 'Generate video')).toBeDisabled();
  });

  test('a presenter and voice send the video, linked to its part, and the page stays put', async ({ app, screen, browser }) => {
    const { api, videos, dialog } = await openAvatarDialog(app, screen, browser, { avatar: 'accepted' });
    const url = await browser.url();

    await choosePresenter(dialog, browser);
    await expect(dialog.getByRole('button', /Change/)).toBeVisible();
    await expect(dialog.getByText('Not chosen yet')).toHaveCount(0);
    await dialog.getByRole('button', 'Generate video').tap();

    await expect(dialog.getByText(ACCEPTED)).toBeVisible({ timeout: 20_000 });
    expect(api.avatars).toHaveLength(1);
    expect(api.avatars[0]).toMatchObject({
      source: SOURCE.video3,
      jobName: jobName(LABEL.video3),
      script: SCRIPT.video3,
      estimatedDurationSeconds: 45
    });
    expect(api.avatars[0].avatarName).toBeTruthy();
    expect(api.avatars[0].voiceName).toBeTruthy();
    expect(api.avatars[0].videoGenerationType).toBeTruthy();
    // Linked to the course, never through the standalone avatar endpoint
    expect(videos.jobs).toHaveLength(0);

    await dialog.getByRole('button', 'Close and continue').tap();
    await expect(dialog).toHaveCount(0);
    expect(await browser.url()).toBe(url);

    // The part now holds its one video
    await expect(head(screen, 3).getByText('Avatar Video')).toBeVisible({ timeout: 20_000 });
    await expect(head(screen, 3).getByText('Generating')).toBeVisible();
    await generateButton(screen, browser, 3).tap();
    await expect(screen.getByRole('menuitem', MENU.avatar)).toBeDisabled();
    await expect(screen.getByRole('menuitem', MENU.explainer)).toBeDisabled();
  });

  test('an edited script goes to this video only', async ({ app, screen, browser }) => {
    const { api, dialog } = await openAvatarDialog(app, screen, browser, { avatar: 'accepted' });
    const edited = 'Video three, shortened: block one hour a day.';

    await dialog.getByLabel('Script').fill(edited);
    await send(dialog, browser);

    await expect(dialog.getByText(ACCEPTED)).toBeVisible({ timeout: 20_000 });
    expect(api.avatars[0].script).toBe(edited);

    await dialog.getByRole('button', 'Close and continue').tap();
    // The course script itself is untouched
    await expect(screen.getByText(SCRIPT.video3)).toBeVisible();
    await expect(screen.getByText(edited)).toHaveCount(0);
  });

  test('an empty script cannot be sent', async ({ app, screen, browser }) => {
    const { api, dialog } = await openAvatarDialog(app, screen, browser, { avatar: 'accepted' });

    await choosePresenter(dialog, browser);
    await expect(dialog.getByRole('button', 'Generate video')).toBeEnabled({ timeout: 20_000 });
    await dialog.getByLabel('Script').fill('');
    await expect(dialog.getByRole('button', 'Generate video')).toBeDisabled();
    expect(api.avatars).toHaveLength(0);
  });

  test('Cancel closes without sending, and the part stays free', async ({ app, screen, browser }) => {
    const { api, dialog } = await openAvatarDialog(app, screen, browser, { avatar: 'accepted' });

    await dialog.getByRole('button', 'Cancel').tap();
    await expect(dialog).toHaveCount(0);
    expect(api.avatars).toHaveLength(0);

    await generateButton(screen, browser, 3).tap();
    await expect(screen.getByRole('menuitem', MENU.avatar)).toBeEnabled();
  });

  test('the presenter picked last is offered again for the next part', async ({ app, screen, browser }) => {
    const { api, dialog } = await openAvatarDialog(app, screen, browser, { avatar: 'accepted' });
    await send(dialog, browser);
    await expect(dialog.getByText(ACCEPTED)).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', 'Close and continue').tap();

    await generateButton(screen, browser, 'courseIntro').tap();
    await screen.getByRole('menuitem', MENU.avatar).tap();
    const next = courseDialog(screen, LABEL.courseIntro);
    await expect(next.getByLabel('Script')).toHaveValue(SCRIPT.courseIntro);
    await expect(next.getByRole('button', /Change/)).toBeVisible();
    await next.getByRole('button', 'Generate video').tap();

    await expect(next.getByText(ACCEPTED)).toBeVisible({ timeout: 20_000 });
    expect(api.avatars).toHaveLength(2);
    expect(api.avatars[1]).toMatchObject({
      source: SOURCE.courseIntro,
      jobName: jobName(LABEL.courseIntro),
      avatarName: api.avatars[0].avatarName,
      voiceName: api.avatars[0].voiceName
    });
  });

  test('a refusal says why, keeps the inputs, and can be sent again', async ({ app, screen, browser }) => {
    const { api, dialog } = await openAvatarDialog(app, screen, browser, {
      avatar: [{ refused: 'The avatar service is busy.' }, 'accepted']
    });

    await send(dialog, browser);
    await expect(dialog.getByRole('alert')).toContainText('The avatar service is busy.', { timeout: 20_000 });
    await expect(dialog.getByLabel('Script')).toHaveValue(SCRIPT.video3);
    await expect(dialog.getByRole('button', /Change/)).toBeVisible();
    await expect(dialog.getByText(ACCEPTED)).toHaveCount(0);

    await dialog.getByRole('button', 'Generate video').tap();
    await expect(dialog.getByText(ACCEPTED)).toBeVisible({ timeout: 20_000 });
    expect(api.avatars).toHaveLength(2);
  });

  test('running out of credits offers an upgrade', async ({ app, screen, browser }) => {
    const { dialog } = await openAvatarDialog(app, screen, browser, { avatar: { errorType: 'InsufficientCredits' } });

    await send(dialog, browser);
    await expect(screen.getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByRole('button', 'Upgrade Plan')).toBeVisible();
    await screen.getByRole('button', 'Maybe Later').tap();
    await expect(screen.getByText('Insufficient Credits')).toHaveCount(0);

    // Back on the course dialog, nothing sent, ready to try again
    await expect(dialog.getByText(ACCEPTED)).toHaveCount(0);
    await expect(dialog.getByRole('button', 'Generate video')).toBeEnabled({ timeout: 20_000 });
  });

  test('a part another request already filled says so and shows that video', async ({ app, screen, browser }) => {
    const { dialog } = await openAvatarDialog(app, screen, browser, {
      avatar: 'occupied',
      occupant: linkedVideo(SEGMENTS.video3, { videoType: 'Explainer', phase: 'Draft', jobId: 888 })
    });

    await send(dialog, browser);
    await expect(dialog.getByText('This part already has a video')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText('Explainer Video')).toBeVisible();
    await expect(dialog.getByText('Draft')).toBeVisible();
    await expect(dialog.getByText(ACCEPTED)).toHaveCount(0);

    await dialog.getByRole('button', 'Close').last().tap();
    await expect(head(screen, 3).getByText('Draft')).toBeVisible({ timeout: 20_000 });
  });

  // Only a request the queue accepted shows success.
  test('a request the queue has not confirmed is not shown as a success', async ({ app, screen, browser }) => {
    const { dialog } = await openAvatarDialog(app, screen, browser, { avatar: 'unconfirmed' });

    await send(dialog, browser);
    await expect(dialog.getByText('Not confirmed yet')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(ACCEPTED)).toHaveCount(0);

    await dialog.getByRole('button', 'Close').last().tap();
    await expect(head(screen, 3).getByText('Submitting')).toBeVisible({ timeout: 20_000 });
  });

  // A lost answer may still have queued the video. The dialog reads the part
  // before offering a resend, and a resend is safe: a part takes one video.
  test('a lost answer is checked first, then sent again', async ({ app, screen, browser }) => {
    const { api, dialog } = await openAvatarDialog(app, screen, browser, { avatar: [{ httpStatus: 502 }, 'accepted'] });

    await send(dialog, browser);
    await expect(dialog.getByText('Checking your request…')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText('Connection problem')).toBeVisible({ timeout: 45_000 });

    await dialog.getByRole('button', 'Send again').tap();
    await expect(dialog.getByText(ACCEPTED)).toBeVisible({ timeout: 20_000 });
    expect(api.avatars).toHaveLength(2);
    expect(api.avatars[1]).toEqual(api.avatars[0]);
  });

  test('closing on a lost answer keeps the part locked while it is confirmed', async ({ app, screen, browser }) => {
    const { dialog } = await openAvatarDialog(app, screen, browser, { avatar: { httpStatus: 502 } });

    await send(dialog, browser);
    await expect(dialog.getByText('Connection problem')).toBeVisible({ timeout: 45_000 });
    await dialog.getByRole('button', 'Close').last().tap();
    await expect(dialog).toHaveCount(0);

    await expect(head(screen, 3).getByText('Request pending')).toBeVisible();
    await generateButton(screen, browser, 3).tap();
    await expect(screen.getByText(PENDING_NOTE)).toBeVisible();
    await expect(screen.getByRole('menuitem', MENU.avatar)).toBeDisabled();
    await expect(screen.getByRole('menuitem', MENU.explainer)).toBeDisabled();
  });
});
