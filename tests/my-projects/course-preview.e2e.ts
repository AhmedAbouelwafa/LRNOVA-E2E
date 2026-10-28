import { describe, test, type Browser } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import { expect, type JsonValue } from 'e2e';
import { mockVideoJob, VIDEO_URL } from '../helpers/tool-api.ts';
import { mockCourseVideoApi } from '../helpers/course-video-api.ts';
import { EXPLAINER_URL, mockTextVideoApi } from '../helpers/text-video-api.ts';
import { LABEL } from '../course-videos/fixture.ts';
import { COURSES, coursesUrl, DETAILS, EXPLAINER_JOB, JOB, MAIN_COURSE_ID } from './courses-fixture.ts';

/**
 * The course preview: a course's ready videos played in the course's order,
 * beside a playlist of every part that has a video. Each video's address is
 * fetched from its own job when it is selected.
 */

const MAIN = 'Time Management Basics';

/** Opens the main course with its ready videos' jobs stubbed (unless the test serves the avatar one itself). */
async function openCourse(app: App, screen: Screen, browser: Browser, options: { avatarJob?: boolean } = {}) {
  await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
  if (options.avatarJob !== false) {
    await mockVideoJob(browser, { id: JOB.introAvatar, status: 'Completed', name: 'Course intro clip' });
  }
  await mockVideoJob(browser, { id: JOB.earlierAvatar, status: 'Completed' });
  await mockTextVideoApi(browser, { job: EXPLAINER_JOB });
  await app.open(coursesUrl(MAIN_COURSE_ID));
  await expect(screen.getByRole('heading', MAIN)).toBeVisible({ timeout: 20_000 });
}

/** The preview is named by its course. */
const preview = (screen: Screen) => screen.getByRole('dialog', MAIN);
const player = (browser: Browser) => browser.locator('video.cpv-video');
/** Where the playing video sits in the course (Module › Topic), above its title. */
const crumbs = (dialog: ReturnType<typeof preview>) => dialog.getByRole('navigation', 'Course location');

describe('my projects: course preview', { tags: ['my-projects', 'course-videos'], session: 'member', timeout: 180_000 }, () => {
  test('Preview course plays the ready videos in the course\'s order', async ({ app, screen, browser }) => {
    await openCourse(app, screen, browser);

    await screen.getByRole('button', 'Preview course').tap();
    const dialog = preview(screen);
    await expect(dialog.getByText('Course preview')).toBeVisible();
    await expect(dialog.getByRole('heading', LABEL.courseIntro)).toBeVisible();
    await expect(dialog.getByText('1 of 2')).toBeVisible();
    await expect(player(browser)).toHaveAttribute('src', VIDEO_URL, { timeout: 20_000 });
    await expect(dialog.getByRole('button', 'Previous video')).toBeDisabled();

    await dialog.getByRole('button', 'Next video').tap();
    await expect(dialog.getByRole('heading', 'Video 3')).toBeVisible();
    await expect(dialog.getByText('2 of 2')).toBeVisible();
    await expect(crumbs(dialog).getByText('Module 1')).toBeVisible();
    await expect(crumbs(dialog).getByText('Topic 2')).toBeVisible();
    await expect(player(browser)).toHaveAttribute('src', EXPLAINER_URL, { timeout: 20_000 });
    await expect(dialog.getByRole('button', 'Next video')).toBeDisabled();

    await dialog.getByRole('button', 'Previous video').tap();
    await expect(dialog.getByText('1 of 2')).toBeVisible();
  });

  test('the playlist lists every part with a video under its module and topic, and only ready ones play', async ({ app, screen, browser }) => {
    await openCourse(app, screen, browser);
    await screen.getByRole('button', 'Preview course').tap();
    const dialog = preview(screen);

    // Under a module/topic heading a row shows a short title; course-level parts keep theirs
    const intro = dialog.getByRole('button', /^Course introduction/);
    const video3 = dialog.getByRole('button', /^Video 3/);
    await expect(intro).toHaveAttribute('aria-current', 'true');
    await expect(intro.getByText('Now playing')).toBeVisible();
    await expect(dialog.getByRole('button', /^Module 1/)).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog.getByText('Topic 2')).toBeVisible();
    await expect(video3).toBeVisible();
    await expect(video3).toHaveAttribute('title', LABEL.video3);

    // A draft and a video still generating are listed, but not as something to play
    await expect(dialog.getByText('Introduction')).toBeVisible();
    await expect(dialog.getByText(LABEL.courseConclusion)).toBeVisible();
    await expect(dialog.getByRole('button', /^Introduction/)).toHaveCount(0);
    await expect(dialog.getByRole('button', /^Course conclusion/)).toHaveCount(0);
    // The earlier version is a playlist of its own
    await expect(dialog.getByText('Conclusion')).toHaveCount(0);

    await video3.tap();
    await expect(video3).toHaveAttribute('aria-current', 'true');
    await expect(intro).not.toHaveAttribute('aria-current', 'true');
    await expect(dialog.getByText('2 of 2')).toBeVisible();
  });

  test('a folded module never changes the order, and unfolds for the video that plays', async ({ app, screen, browser }) => {
    await openCourse(app, screen, browser);
    await screen.getByRole('button', 'Preview course').tap();
    const dialog = preview(screen);

    const module1 = dialog.getByRole('button', /^Module 1/);
    await module1.tap();
    await expect(module1).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog.getByRole('button', /^Video 3/)).toHaveCount(0);

    // Next still goes to Video 3, and its module opens to show it playing
    await dialog.getByRole('button', 'Next video').tap();
    await expect(dialog.getByText('2 of 2')).toBeVisible();
    await expect(dialog.getByRole('heading', 'Video 3')).toBeVisible();
    await expect(module1).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog.getByRole('button', /^Video 3/)).toHaveAttribute('aria-current', 'true');
    await expect(player(browser)).toHaveAttribute('src', EXPLAINER_URL, { timeout: 20_000 });
  });

  test("a row's Preview opens on that video", async ({ app, screen, browser }) => {
    await openCourse(app, screen, browser);

    await screen.getByRole('button', `Preview ${LABEL.video3}`).tap();
    const dialog = preview(screen);
    await expect(dialog.getByRole('heading', 'Video 3')).toBeVisible();
    await expect(crumbs(dialog).getByText('Topic 2')).toBeVisible();
    await expect(dialog.getByText('2 of 2')).toBeVisible();
  });

  test('an earlier version previews on its own', async ({ app, screen, browser }) => {
    await openCourse(app, screen, browser);

    await screen.getByRole('button', `Preview ${LABEL.moduleConclusion}`).tap();
    const dialog = preview(screen);
    await expect(dialog.getByRole('heading', 'Conclusion')).toBeVisible();
    await expect(crumbs(dialog).getByText('Module 1')).toBeVisible();
    await expect(dialog.getByText('1 of 1')).toBeVisible();
    await expect(dialog.getByText(LABEL.courseIntro)).toHaveCount(0);
  });

  test('Open in tool closes the preview and opens the video', async ({ app, screen, browser }) => {
    await openCourse(app, screen, browser);

    await screen.getByRole('button', `Preview ${LABEL.video3}`).tap();
    await preview(screen).getByRole('button', 'Open in tool').tap();
    await expect(browser).toHaveURL(`/tools/text-to-video-generator/${EXPLAINER_JOB.id}`, { timeout: 20_000 });
  });

  test('Close leaves the course as it was', async ({ app, screen, browser }) => {
    await openCourse(app, screen, browser);

    await screen.getByRole('button', 'Preview course').tap();
    await expect(preview(screen)).toBeVisible();
    await preview(screen).getByRole('button', 'Close').tap();

    await expect(preview(screen)).toHaveCount(0);
    await expect(browser).toHaveURL(coursesUrl(MAIN_COURSE_ID));
    await expect(screen.getByRole('heading', MAIN)).toBeVisible();
  });

  test('a video whose address cannot be read says so and can be tried again', async ({ app, screen, browser }) => {
    const reads: number[] = [];
    await browser.route(`**/api/VideoGenerationTool/job/${JOB.introAvatar}`, async (route) => {
      reads.push(Date.now());
      const body: JsonValue = {
        succeeded: true,
        message: '',
        statusCode: 200,
        errorType: null,
        errors: null,
        data: { id: JOB.introAvatar, status: 'Completed', videoUrl: null }
      };
      await route.fulfill({ json: body });
    });
    await openCourse(app, screen, browser, { avatarJob: false });

    await screen.getByRole('button', 'Preview course').tap();
    const dialog = preview(screen);
    await expect(dialog.getByText("This video can't be played")).toBeVisible({ timeout: 20_000 });
    await expect(player(browser)).toHaveCount(0);
    expect(reads).toHaveLength(1);

    await dialog.getByRole('button', 'Try again').tap();
    await expect.poll(() => reads.length, { timeout: 10_000 }).toBe(2);
    await expect(dialog.getByText("This video can't be played")).toBeVisible();
  });
});
