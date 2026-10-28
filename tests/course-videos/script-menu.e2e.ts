import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockToolApi, mockVideoJob, PROJECT_DETAIL_ID } from '../helpers/tool-api.ts';
import { mockCourseVideoApi, linkedVideo } from '../helpers/course-video-api.ts';
import { mockTextVideoApi } from '../helpers/text-video-api.ts';
import { answerAll } from '../helpers/questionnaire.ts';
import { ANSWERS, ENDPOINT, ROUTE, TOTAL } from '../tools/full-course-script/fixture.ts';
import { savedJob, STORYBOARD } from '../tools/text-to-video-generator/fixture.ts';
import {
  COURSE_VIDEO_CONTEXT,
  courseDialog,
  generateButton,
  head,
  LABEL,
  MENU,
  OUTPUT,
  PROJECT_ID,
  SCRIPT,
  SEGMENT_LIST,
  SEGMENTS,
  openCourseScript
} from './fixture.ts';

const OCCUPIED_NOTE = 'This part of the course already has a video. Each part can have one video.';
const DELETED_NOTE = "This part's video was deleted. Each part can have one video, so a new one cannot be created here.";
const SOURCE_CHANGED = 'The script was edited after this video was generated';

describe(
  'course videos: the Generate a video menu',
  { tags: ['course-videos', 'full-course-script'], session: 'member', agentContext: COURSE_VIDEO_CONTEXT, timeout: 180_000 },
  () => {
    test('a free part offers an avatar or an explainer video, and the page stays put', async ({ app, screen, browser }) => {
      const { api } = await openCourseScript(app, screen, browser);
      expect(api.detailReads).toContain(PROJECT_DETAIL_ID);

      await generateButton(screen, browser, 3).tap();
      await expect(screen.getByRole('menuitem', MENU.avatar)).toBeEnabled();
      await expect(screen.getByRole('menuitem', MENU.explainer)).toBeEnabled();
      await expect(screen.getByRole('menuitem', MENU.openVideo)).toHaveCount(0);
      await expect(screen.getByRole('menuitem', MENU.continueDraft)).toHaveCount(0);
      await expect(screen.getByText(OCCUPIED_NOTE)).toHaveCount(0);

      // Nothing happens until a type is picked: no navigation, no dialog
      await screen.getByRole('menuitem', MENU.avatar).press('Escape');
      await expect(screen.getByRole('menuitem', MENU.avatar)).toHaveCount(0);
      await expect(browser).toHaveURL(new RegExp(`${ROUTE}\\?projectId=${PROJECT_ID}`));
      expect(api.avatars).toHaveLength(0);
    });

    test('every part of the course has its own menu', async ({ app, screen, browser }) => {
      await openCourseScript(app, screen, browser);

      for (const part of ['courseIntro', 'moduleIntro', 1, 2, 3, 'courseConclusion'] as const) {
        await generateButton(screen, browser, part).tap();
        await expect(screen.getByRole('menuitem', MENU.avatar)).toBeEnabled();
        await screen.getByRole('menuitem', MENU.avatar).press('Escape');
        await expect(screen.getByRole('menuitem', MENU.avatar)).toHaveCount(0);
      }
    });

    // A course produced just now is saved as it arrives, so its parts can be
    // linked straight away: the page reads them as soon as the script shows.
    test('a freshly generated script reads which parts hold a video', async ({ app, screen, browser }) => {
      await mockToolApi(browser, ENDPOINT, OUTPUT);
      const api = await mockCourseVideoApi(browser, { segments: SEGMENT_LIST });
      await app.open(ROUTE);
      await answerAll(screen, ANSWERS, TOTAL);
      await screen.getByRole('button', 'Generate').tap();
      await expect(screen.getByText(SCRIPT.video3)).toBeVisible({ timeout: 20_000 });

      await expect.poll(() => api.detailReads, { timeout: 20_000 }).toContain(PROJECT_DETAIL_ID);
      await generateButton(screen, browser, 3).tap();
      await expect(screen.getByRole('menuitem', MENU.explainer)).toBeEnabled();
    });

    test('a part with a ready avatar video shows it, and offers only Open video', async ({ app, screen, browser }) => {
      const ready = linkedVideo(SEGMENTS.video3, { videoType: 'Avatar', phase: 'Ready', jobId: 7001 });
      await mockVideoJob(browser, { id: 7001, status: 'Completed', name: ready.video.jobName, script: SCRIPT.video3 });
      await openCourseScript(app, screen, browser, { linked: [ready] });

      await expect(head(screen, 3).getByText('Avatar Video')).toBeVisible();
      await expect(head(screen, 3).getByText('Ready')).toBeVisible();
      // Only that part: the others are still free
      await expect(head(screen, 1).getByText('Ready')).toHaveCount(0);

      await generateButton(screen, browser, 3).tap();
      await expect(screen.getByText(OCCUPIED_NOTE)).toBeVisible();
      await expect(screen.getByRole('menuitem', MENU.avatar)).toBeDisabled();
      await expect(screen.getByRole('menuitem', MENU.explainer)).toBeDisabled();

      await screen.getByRole('menuitem', MENU.openVideo).tap();
      await expect(browser).toHaveURL(/\/tools\/video-ai-generator\/5\?jobId=7001/, { timeout: 20_000 });
    });

    test('a ready explainer video opens on the explainer page', async ({ app, screen, browser }) => {
      await mockTextVideoApi(browser, { job: savedJob('Completed') });
      const ready = linkedVideo(SEGMENTS.courseIntro, { videoType: 'Explainer', phase: 'Ready', jobId: savedJob('Completed').id });
      await openCourseScript(app, screen, browser, { linked: [ready] });

      await expect(head(screen, 'courseIntro').getByText('Explainer Video')).toBeVisible();
      await generateButton(screen, browser, 'courseIntro').tap();
      await screen.getByRole('menuitem', MENU.openVideo).tap();
      await expect(browser).toHaveURL(`/tools/text-to-video-generator/${savedJob('Completed').id}`, { timeout: 20_000 });
    });

    test('a part being generated stays locked until it is done', async ({ app, screen, browser }) => {
      const generating = linkedVideo(SEGMENTS.video1, { videoType: 'Avatar', phase: 'Generating', jobId: 7002 });
      await openCourseScript(app, screen, browser, { linked: [generating] });

      await expect(head(screen, 1).getByText('Generating')).toBeVisible();
      await generateButton(screen, browser, 1).tap();
      await expect(screen.getByRole('menuitem', MENU.avatar)).toBeDisabled();
      await expect(screen.getByRole('menuitem', MENU.explainer)).toBeDisabled();
      await expect(screen.getByRole('menuitem', MENU.openVideo)).toBeEnabled();
    });

    // A draft is a storyboard already paid for: it is continued, never started over.
    test('a storyboard draft is continued, not started again', async ({ app, screen, browser }) => {
      const draft = savedJob('StoryboardCompleted');
      const textApi = await mockTextVideoApi(browser, { job: draft });
      const { api } = await openCourseScript(app, screen, browser, {
        linked: [linkedVideo(SEGMENTS.video3, { videoType: 'Explainer', phase: 'Draft', jobId: draft.id })],
        textApi
      });

      await expect(head(screen, 3).getByText('Draft')).toBeVisible();
      await generateButton(screen, browser, 3).tap();
      await expect(screen.getByRole('menuitem', MENU.avatar)).toBeDisabled();
      await expect(screen.getByRole('menuitem', MENU.explainer)).toBeDisabled();
      await expect(screen.getByRole('menuitem', MENU.openVideo)).toHaveCount(0);
      await screen.getByRole('menuitem', MENU.continueDraft).tap();

      const dialog = courseDialog(screen, LABEL.video3);
      await expect(dialog.getByText(STORYBOARD.scenes[0].narration)).toBeVisible({ timeout: 20_000 });
      await expect(dialog.getByText('Review and edit the scenes, then generate the video.')).toBeVisible();
      expect(textApi.loads).toContain(draft.id);
      // The same job: no new storyboard, no new charge
      expect(api.storyboards).toHaveLength(0);
      expect(textApi.storyboards).toHaveLength(0);
    });

    test('a deleted video still holds its part, with nothing to open', async ({ app, screen, browser }) => {
      await openCourseScript(app, screen, browser, {
        linked: [linkedVideo(SEGMENTS.video3, { videoType: 'Avatar', phase: 'Ready', jobId: 7003, jobDeleted: true })]
      });

      await expect(head(screen, 3).getByText('Video deleted')).toBeVisible();
      await generateButton(screen, browser, 3).tap();
      await expect(screen.getByText(DELETED_NOTE)).toBeVisible();
      await expect(screen.getByRole('menuitem', MENU.avatar)).toBeDisabled();
      await expect(screen.getByRole('menuitem', MENU.explainer)).toBeDisabled();
      await expect(screen.getByRole('menuitem', MENU.openVideo)).toHaveCount(0);
    });

    test('a video made before the script was edited is flagged', async ({ app, screen, browser }) => {
      await openCourseScript(app, screen, browser, {
        linked: [linkedVideo(SEGMENTS.video3, { videoType: 'Avatar', phase: 'Ready', jobId: 7004, sourceChanged: true })]
      });

      await expect(head(screen, 3).getByText('Ready')).toBeVisible();
      await expect(head(screen, 3).getByText(SOURCE_CHANGED)).toBeAttached();
    });

    // While editing, the words on screen are an unsaved draft: no video is made from them.
    test('editing the script hides every Generate a video', async ({ app, screen, browser }) => {
      await openCourseScript(app, screen, browser, {
        linked: [linkedVideo(SEGMENTS.video3, { videoType: 'Avatar', phase: 'Ready', jobId: 7005 })]
      });
      await expect(head(screen, 3).getByText('Ready')).toBeVisible();

      await browser.locator('button.tool-edit-button').tap();
      await expect(screen.getByText('Editing')).toBeVisible();
      await expect(screen.getByRole('button', 'Generate a video')).toHaveCount(0);
      await expect(screen.getByText('Avatar Video')).toHaveCount(0);

      await screen.getByRole('button', 'Cancel').tap();
      await expect(generateButton(screen, browser, 3)).toBeVisible();
    });

    test('the agent opens an explainer video for Video 3', { tags: ['agent'] }, async ({ app, screen, browser, agent }) => {
      await openCourseScript(app, screen, browser);

      await agent.act('open the "Generate a video" menu of Video 3 and choose Explainer Video');
      const dialog = courseDialog(screen, LABEL.video3);
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      await expect(dialog.getByText('Explainer Video')).toBeVisible();
      await expect(dialog.getByText('The script is used as the video idea.')).toBeVisible();
    });
  }
);
