import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockSavedProject, mockVideoJob } from '../helpers/tool-api.ts';
import { mockCourseVideoApi } from '../helpers/course-video-api.ts';
import { mockTextVideoApi } from '../helpers/text-video-api.ts';
import { INPUTS, LABEL, OUTPUT } from '../course-videos/fixture.ts';
import { COURSES, COURSES_TAB, coursesUrl, DETAILS, DRAFT_COURSE_ID, EXPLAINER_JOB, JOB, MAIN_COURSE_ID } from './courses-fixture.ts';

const MAIN = 'Time Management Basics';
const DRAFT = 'Onboarding Essentials';

/**
 * One part's row in a course: its title, then its video's type, status, Preview and Open. Under a module
 * the row shows a short title ("Introduction", "Video 3"); its full course path is the title's tooltip,
 * which is what finds it here, exactly.
 */
function row(browser: import('@e2e-dev/web').Browser, label: string) {
  return browser.locator(`.cp-segment:has(.cp-segment__label[title="${label}"])`);
}

/** The latest version's Module 1 fold toggle (the earlier version's Module 1 comes after it). */
function module1(screen: import('e2e').Screen) {
  return screen.getByRole('button', /^Module 1/).first();
}

describe('my projects: courses', { tags: ['my-projects', 'course-videos'], session: 'member', timeout: 180_000 }, () => {
  test('the Courses tab lists each course with how far its videos are', async ({ app, screen, browser }) => {
    const api = await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await app.open('/my-projects');

    await screen.getByRole('tab', COURSES_TAB).tap();
    await expect(browser).toHaveURL(coursesUrl());
    await expect(screen.getByRole('tab', COURSES_TAB)).toHaveAttribute('aria-selected', 'true');

    const main = screen.getByRole('button', new RegExp(MAIN));
    await expect(main).toBeVisible({ timeout: 20_000 });
    await expect(main.getByText('Videos: 4')).toBeVisible();
    await expect(main.getByText('2 ready')).toBeVisible();
    await expect(main.getByText('1 in progress')).toBeVisible();
    await expect(main.getByText('1 drafts')).toBeVisible();
    await expect(main.getByText(/need attention/)).toHaveCount(0);
    await expect(main.getByText('Draft')).toHaveCount(0);

    const draft = screen.getByRole('button', new RegExp(DRAFT));
    await expect(draft.getByText('Draft')).toBeVisible();

    // A course with no name still gets a card
    await expect(screen.getByText('Untitled course')).toBeVisible();
    await expect(screen.getByText('1 need attention')).toBeVisible();

    expect(api.listRequests.length).toBeGreaterThan(0);
  });

  test('each tab has its own address', async ({ app, screen, browser }) => {
    await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await app.open('/my-projects?tab=explainer');
    await expect(screen.getByRole('tab', 'Explainer Videos')).toHaveAttribute('aria-selected', 'true');

    await screen.getByRole('tab', COURSES_TAB).tap();
    await expect(browser).toHaveURL(coursesUrl());
    await screen.getByRole('tab', 'Avatar Videos').tap();
    // The first tab is the default and leaves the address bare
    await expect(browser).toHaveURL('/my-projects');
  });

  test('a course opens on its videos, in the course\'s own order', async ({ app, screen, browser }) => {
    const api = await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await app.open(coursesUrl());

    await screen.getByText(MAIN).tap();
    await expect(browser).toHaveURL(coursesUrl(MAIN_COURSE_ID));
    await expect(screen.getByRole('heading', MAIN)).toBeVisible({ timeout: 20_000 });
    expect(api.courseReads).toContain(MAIN_COURSE_ID);

    // A module heading carries its counts: the latest Module 1 has two videos, one of them ready
    await expect(screen.getByRole('heading', /^Module 1/).first()).toBeVisible();
    await expect(module1(screen).getByText('1/2 ready')).toBeVisible();
    await expect(screen.getByRole('heading', /^Topic 2/)).toBeVisible();
    await expect(screen.getByRole('heading', 'Earlier version of this course')).toBeVisible();

    // Under its module and topic headings a row shows a short title; the full path stays on it
    const labels = await browser.locator('.cp-segment__label').allTextContents();
    expect(labels.map((label) => label.trim())).toEqual(['Course introduction', 'Introduction', 'Video 3', 'Course conclusion', 'Conclusion']);
    const paths = await browser.evaluate(() =>
      Array.from(document.querySelectorAll('.cp-segment__label'), (label) => label.getAttribute('title') ?? ''));
    expect(paths).toEqual([
      LABEL.courseIntro,
      LABEL.moduleIntro,
      LABEL.video3,
      LABEL.courseConclusion,
      // The earlier version, after the latest
      LABEL.moduleConclusion
    ]);

    await expect(row(browser, LABEL.courseIntro).getByText('Avatar Video')).toBeVisible();
    await expect(row(browser, LABEL.courseIntro).getByText('Ready')).toBeVisible();
    await expect(row(browser, LABEL.video3).getByText('Explainer Video')).toBeVisible();
    await expect(row(browser, LABEL.moduleIntro).getByText('Draft')).toBeVisible();
    await expect(row(browser, LABEL.courseConclusion).getByText('Generating')).toBeVisible();
    // Only a ready video can be previewed
    await expect(row(browser, LABEL.courseConclusion).getByRole('button', /^Preview/)).toHaveCount(0);
    await expect(row(browser, LABEL.moduleIntro).getByRole('button', /^Preview/)).toHaveCount(0);
  });

  test('modules and topics fold and unfold without losing their videos', async ({ app, screen, browser }) => {
    await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await app.open(coursesUrl(MAIN_COURSE_ID));
    await expect(screen.getByRole('heading', MAIN)).toBeVisible({ timeout: 20_000 });

    const toggle = module1(screen);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(row(browser, LABEL.moduleIntro)).toHaveCount(0);
    await expect(row(browser, LABEL.video3)).toHaveCount(0);
    // Course-level parts belong to no module and stay in place
    await expect(row(browser, LABEL.courseIntro)).toBeVisible();
    await expect(row(browser, LABEL.courseConclusion)).toBeVisible();

    await toggle.tap();
    await expect(row(browser, LABEL.video3)).toBeVisible();

    // A topic folds on its own, leaving the rest of its module
    const topic2 = screen.getByRole('button', /^Topic 2/);
    await topic2.tap();
    await expect(topic2).toHaveAttribute('aria-expanded', 'false');
    await expect(row(browser, LABEL.video3)).toHaveCount(0);
    await expect(row(browser, LABEL.moduleIntro)).toBeVisible();
    await topic2.tap();
    await expect(row(browser, LABEL.video3)).toBeVisible();

    // Collapse all folds every module of every version; Expand all brings them back
    await screen.getByRole('button', 'Collapse all').tap();
    await expect(browser.locator('.cp-segment')).toHaveCount(2);
    await screen.getByRole('button', 'Expand all').tap();
    await expect(browser.locator('.cp-segment')).toHaveCount(5);
  });

  test('a folded module stays folded after a trip to a tool and Back', async ({ app, screen, browser }) => {
    await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await mockVideoJob(browser, { id: JOB.introAvatar, status: 'Completed', name: 'Course intro clip' });
    await app.open(coursesUrl(MAIN_COURSE_ID));
    await expect(screen.getByRole('heading', MAIN)).toBeVisible({ timeout: 20_000 });

    await module1(screen).tap();
    await expect(row(browser, LABEL.video3)).toHaveCount(0);

    await row(browser, LABEL.courseIntro).getByRole('button', 'Open').tap();
    await expect(browser).toHaveURL(new RegExp(`/tools/video-ai-generator/5\\?jobId=${JOB.introAvatar}`), { timeout: 20_000 });
    await browser.back();

    await expect(screen.getByRole('heading', MAIN)).toBeVisible({ timeout: 20_000 });
    await expect(module1(screen)).toHaveAttribute('aria-expanded', 'false');
    await expect(row(browser, LABEL.video3)).toHaveCount(0);
    // The earlier version's module was never folded
    await expect(row(browser, LABEL.moduleConclusion)).toBeVisible();
  });

  test('Back to courses returns to the list', async ({ app, screen, browser }) => {
    await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await app.open(coursesUrl(MAIN_COURSE_ID));
    await expect(screen.getByRole('heading', MAIN)).toBeVisible({ timeout: 20_000 });

    await screen.getByRole('button', 'Back to courses').tap();
    await expect(browser).toHaveURL(coursesUrl());
    await expect(screen.getByText(DRAFT)).toBeVisible({ timeout: 20_000 });
  });

  test('tapping Courses again while a course is open returns to the list', async ({ app, screen, browser }) => {
    await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await app.open(coursesUrl(MAIN_COURSE_ID));
    await expect(screen.getByRole('heading', MAIN)).toBeVisible({ timeout: 20_000 });

    await screen.getByRole('tab', COURSES_TAB).tap();
    await expect(browser).toHaveURL(coursesUrl());
    await expect(screen.getByText(DRAFT)).toBeVisible({ timeout: 20_000 });
  });

  test('an avatar video opens on the avatar page, and Back returns to its course', async ({ app, screen, browser }) => {
    await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await mockVideoJob(browser, { id: JOB.introAvatar, status: 'Completed', name: 'Course intro clip' });
    await app.open(coursesUrl(MAIN_COURSE_ID));

    await row(browser, LABEL.courseIntro).getByRole('button', 'Open').tap();
    await expect(browser).toHaveURL(new RegExp(`/tools/video-ai-generator/5\\?jobId=${JOB.introAvatar}`), { timeout: 20_000 });

    await browser.back();
    await expect(browser).toHaveURL(coursesUrl(MAIN_COURSE_ID));
    await expect(screen.getByRole('heading', MAIN)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByRole('tab', COURSES_TAB)).toHaveAttribute('aria-selected', 'true');
  });

  test('an explainer video opens on the explainer page', async ({ app, screen, browser }) => {
    await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await mockTextVideoApi(browser, { job: EXPLAINER_JOB });
    await app.open(coursesUrl(MAIN_COURSE_ID));

    await row(browser, LABEL.video3).getByRole('button', 'Open').tap();
    await expect(browser).toHaveURL(`/tools/text-to-video-generator/${EXPLAINER_JOB.id}`, { timeout: 20_000 });
  });

  test('Open course script opens the saved course', async ({ app, screen, browser }) => {
    await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await mockSavedProject(browser, MAIN_COURSE_ID, OUTPUT, INPUTS);
    await app.open(coursesUrl(MAIN_COURSE_ID));

    await screen.getByRole('button', 'Open course script').tap();
    await expect(browser).toHaveURL(new RegExp(`/tools/full-course-script-tool/1\\?projectId=${MAIN_COURSE_ID}`), { timeout: 20_000 });
    await expect(screen.getByText(OUTPUT.courseData.courseIntro)).toBeVisible({ timeout: 20_000 });
  });

  test('search narrows the courses, and says when nothing matches', async ({ app, screen, browser }) => {
    const api = await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await app.open(coursesUrl());
    await expect(screen.getByText(MAIN)).toBeVisible({ timeout: 20_000 });

    await screen.getByLabel('Search courses').fill('onboarding');
    await expect(screen.getByText(MAIN)).toHaveCount(0, { timeout: 10_000 });
    await expect(screen.getByText(DRAFT)).toBeVisible();
    expect(api.listRequests.at(-1)?.searchParams.get('search')).toBe('onboarding');

    await screen.getByLabel('Search courses').fill('no such course');
    await expect(screen.getByText('No courses match your search.')).toBeVisible({ timeout: 10_000 });
  });

  test('with no course videos the tab says how to make one', async ({ app, screen, browser }) => {
    await mockCourseVideoApi(browser, { courses: [] });
    await app.open(coursesUrl());

    await expect(screen.getByText('No course videos yet')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(/Generate an avatar or explainer video from any part of a Full Course Script/)).toBeVisible();
    await expect(screen.getByLabel('Search courses')).toHaveCount(0);
  });

  test('a list that fails to load can be tried again', async ({ app, screen, browser }) => {
    await mockCourseVideoApi(browser, { courses: { httpStatus: 500 } });
    await app.open(coursesUrl());
    await expect(screen.getByText('Courses could not be loaded.')).toBeVisible({ timeout: 20_000 });

    await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await screen.getByRole('button', 'Try again').tap();
    await expect(screen.getByText(MAIN)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('Courses could not be loaded.')).toHaveCount(0);
  });

  test('a course that fails to load can be tried again', async ({ app, screen, browser }) => {
    const missing = 880_999;
    const api = await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await app.open(coursesUrl(missing));

    await expect(screen.getByText('This course could not be loaded.')).toBeVisible({ timeout: 20_000 });
    await screen.getByRole('button', 'Try again').tap();
    await expect.poll(() => api.courseReads.filter((id) => id === missing).length).toBe(2);
    await expect(screen.getByRole('button', 'Back to courses')).toBeVisible();
  });

  test('a course with no ready video cannot be previewed yet', async ({ app, screen, browser }) => {
    await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await app.open(coursesUrl(DRAFT_COURSE_ID));

    await expect(screen.getByRole('heading', DRAFT)).toBeVisible({ timeout: 20_000 });
    // The reason is read out with the disabled button (its tooltip also carries the same text)
    await expect(screen.getByRole('button', 'Preview course')).toBeDisabled();
    await expect(screen.getByRole('button', 'Preview course')).toHaveAttribute('aria-describedby', 'cp-preview-none');
    await expect(browser.locator('#cp-preview-none')).toBeAttached();
    await expect(screen.getByText('No videos are ready to preview yet.').first()).toBeAttached();
  });

  test('the agent opens a course from the list', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
    await mockCourseVideoApi(browser, { courses: COURSES, details: DETAILS });
    await app.open(coursesUrl());
    await expect(screen.getByText(MAIN)).toBeVisible({ timeout: 20_000 });

    await agent.act('open the course {course}', { params: { course: MAIN } });
    await expect(browser).toHaveURL(coursesUrl(MAIN_COURSE_ID));
    await expect(screen.getByRole('heading', MAIN)).toBeVisible({ timeout: 20_000 });
  });
});
