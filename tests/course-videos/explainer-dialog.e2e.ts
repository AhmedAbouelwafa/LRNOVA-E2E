import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { linkedVideo, type CourseVideoApiOptions } from '../helpers/course-video-api.ts';
import { DEFAULT_JOB_ID, mockTextVideoApi, type TextVideoApiOptions } from '../helpers/text-video-api.ts';
import { answer, answerAll, progress } from '../helpers/questionnaire.ts';
import { DEFAULT_VOICE, savedJob, STORYBOARD, VIDEO } from '../tools/text-to-video-generator/fixture.ts';
import {
  COURSE,
  courseDialog,
  EXPLAINER_ANSWERS,
  EXPLAINER_PLACEHOLDER,
  EXPLAINER_TOTAL,
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
const [SCENE_1, SCENE_2] = STORYBOARD.scenes;

/**
 * Opens the course script and the explainer dialog for Video 3. The video
 * itself (stage 2) goes through the explainer's own jobs API, stubbed here too.
 */
async function openExplainerDialog(
  app: App,
  screen: Screen,
  browser: Browser,
  options: CourseVideoApiOptions = {},
  textOptions: TextVideoApiOptions = {}
) {
  const textApi = await mockTextVideoApi(browser, textOptions);
  const mocks = await openCourseScript(app, screen, browser, { storyboard: STORYBOARD, textApi, ...options });
  await generateButton(screen, browser, 3).tap();
  await screen.getByRole('menuitem', MENU.explainer).tap();
  const dialog = courseDialog(screen, LABEL.video3);
  await expect(dialog).toBeVisible();
  return { ...mocks, textApi, dialog };
}

/** Answers the dialog's questions and asks for the storyboard. */
async function generateStoryboard(dialog: Screen) {
  await answerAll(dialog, EXPLAINER_ANSWERS, EXPLAINER_TOTAL);
  await dialog.getByRole('button', 'Generate').tap();
}

async function expectStoryboard(dialog: Screen) {
  await expect(dialog.getByText(SCENE_1.narration)).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText('Review and edit the scenes, then generate the video.')).toBeVisible();
}

describe('course videos: explainer video', { tags: ['course-videos', 'full-course-script'], session: 'member', timeout: 180_000 }, () => {
  test("the part's script is the video idea", async ({ app, screen, browser }) => {
    const { dialog } = await openExplainerDialog(app, screen, browser);

    await expect(dialog.getByText('Explainer Video')).toBeVisible();
    await expect(dialog.getByText(COURSE.title)).toBeVisible();
    await expect(dialog.getByText('The script is used as the video idea.')).toBeVisible();
    await expect(progress(dialog, 0, EXPLAINER_TOTAL)).toBeVisible();

    await answer(dialog, 'continue'); // Style
    await expect(dialog.getByPlaceholder(EXPLAINER_PLACEHOLDER.prompt)).toHaveValue(SCRIPT.video3);
  });

  // The standalone page caps a video idea at 200 characters; a course script
  // runs far longer, and the dialog takes it whole.
  test('a video idea longer than the standalone limit is accepted', async ({ app, screen, browser }) => {
    const { dialog } = await openExplainerDialog(app, screen, browser);
    const long = `${SCRIPT.video3} ${'Block the time before the week fills up. '.repeat(15)}`.trim();
    expect(long.length).toBeGreaterThan(200);

    await answer(dialog, 'continue'); // Style
    await dialog.getByPlaceholder(EXPLAINER_PLACEHOLDER.prompt).fill(long);
    await expect(dialog.getByText(`${long.length}/25000`)).toBeVisible();
    await expect(dialog.getByText(/cannot exceed/)).toHaveCount(0);
    await dialog.getByRole('button', 'Continue').tap();
    await expect(progress(dialog, 2, EXPLAINER_TOTAL)).toBeVisible();
  });

  test('the storyboard is made for the part, then the video from it', async ({ app, screen, browser }) => {
    const { api, textApi, dialog } = await openExplainerDialog(app, screen, browser);
    const url = await browser.url();

    await generateStoryboard(dialog);
    await expectStoryboard(dialog);
    expect(api.storyboards).toHaveLength(1);
    expect(api.storyboards[0]).toMatchObject({
      source: SOURCE.video3,
      jobName: jobName(LABEL.video3),
      prompt: SCRIPT.video3,
      style: 'realistic',
      orientation: 'portrait',
      voice: DEFAULT_VOICE,
      estimatedDurationMinutes: 3,
      targetAudience: VIDEO.audience,
      ageMin: '20',
      ageMax: '30',
      knowledgeLevel: 'intermediate'
    });
    // Linked to the course, never through the standalone storyboard endpoint
    expect(textApi.storyboards).toHaveLength(0);

    await dialog.getByRole('button', /Generate video/).tap();
    await expect(dialog.getByText(ACCEPTED)).toBeVisible({ timeout: 20_000 });
    expect(textApi.renders).toHaveLength(1);
    expect(textApi.renders[0].jobId).toBe(DEFAULT_JOB_ID);
    expect(textApi.renders[0].storyboard.scenes[1].narration).toBe(SCENE_2.narration);

    await dialog.getByRole('button', 'Close and continue').tap();
    await expect(dialog).toHaveCount(0);
    expect(await browser.url()).toBe(url);
    await expect(head(screen, 3).getByText('Explainer Video')).toBeVisible({ timeout: 20_000 });
    await expect(head(screen, 3).getByText('Generating')).toBeVisible();
  });

  // Leaving with a storyboard and no video keeps the storyboard as a draft of
  // that part, to be continued from the menu.
  test('a storyboard left without a video becomes the part\'s draft', async ({ app, screen, browser }) => {
    const { dialog } = await openExplainerDialog(app, screen, browser);

    await generateStoryboard(dialog);
    await expectStoryboard(dialog);
    await dialog.getByRole('button', 'Close').last().tap();
    await expect(dialog).toHaveCount(0);

    await expect(head(screen, 3).getByText('Draft')).toBeVisible({ timeout: 20_000 });
    await generateButton(screen, browser, 3).tap();
    await expect(screen.getByRole('menuitem', MENU.explainer)).toBeDisabled();
    await expect(screen.getByRole('menuitem', MENU.continueDraft)).toBeVisible();
  });

  test('a refused storyboard says why and can be tried again', async ({ app, screen, browser }) => {
    const { api, dialog } = await openExplainerDialog(app, screen, browser, {
      storyboard: [{ refused: 'The storyboard model is busy.' }, STORYBOARD]
    });

    await generateStoryboard(dialog);
    await expect(dialog.getByRole('alert')).toContainText('The storyboard model is busy.', { timeout: 20_000 });
    await expect(dialog.getByText(SCENE_1.narration)).toHaveCount(0);

    await dialog.getByRole('button', 'Try again').tap();
    await expectStoryboard(dialog);
    expect(api.storyboards).toHaveLength(2);
  });

  test('a part that already has a draft continues it instead', async ({ app, screen, browser }) => {
    const draft = savedJob('StoryboardCompleted');
    const { textApi, dialog } = await openExplainerDialog(
      app,
      screen,
      browser,
      { storyboard: 'occupied', occupant: linkedVideo(SEGMENTS.video3, { videoType: 'Explainer', phase: 'Draft', jobId: draft.id }) },
      { job: draft }
    );

    await generateStoryboard(dialog);
    await expect(dialog.getByText('This part already has a video')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText('This part already has a storyboard draft. Continue it instead of starting a new one.')).toBeVisible();

    await dialog.getByRole('button', 'Continue storyboard').tap();
    await expectStoryboard(dialog);
    expect(textApi.loads).toContain(draft.id);
  });

  // The backend puts a refused job back to its draft: the edited storyboard
  // stays on screen, with the reason, to be sent again.
  test('a refused video keeps the storyboard to try again', async ({ app, screen, browser }) => {
    const { textApi, dialog } = await openExplainerDialog(app, screen, browser, {}, { render: { refused: 'Rendering is paused.' } });

    await generateStoryboard(dialog);
    await expectStoryboard(dialog);
    await dialog.getByRole('button', /Generate video/).tap();

    await expect(dialog.getByRole('alert')).toContainText('Rendering is paused.', { timeout: 20_000 });
    await expect(dialog.getByText(SCENE_1.narration)).toBeVisible();
    await expect(dialog.getByRole('button', /Generate video/)).toBeEnabled();
    await expect(dialog.getByText(ACCEPTED)).toHaveCount(0);
    expect(textApi.renders).toHaveLength(1);
  });
});
