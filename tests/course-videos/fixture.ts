import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockSavedProject, mockVideoApi, PROJECT_DETAIL_ID, PROJECT_ID } from '../helpers/tool-api.ts';
import { mockCourseVideoApi, type CourseVideoApiOptions, type Segment } from '../helpers/course-video-api.ts';
import type { Answer } from '../helpers/questionnaire.ts';
import { COURSE, OUTPUT, ROUTE } from '../tools/full-course-script/fixture.ts';
import { minutes, PLACEHOLDER as EXPLAINER_PLACEHOLDER, VIDEO as EXPLAINER_VIDEO } from '../tools/text-to-video-generator/fixture.ts';

/**
 * Course videos: an avatar or explainer video made from one part of a Full
 * Course Script, without leaving the script. Each "Generate a video" button
 * opens a menu (Avatar Video / Explainer Video), and each choice a dialog that
 * links the video to that part. A part holds one video; its status chip sits
 * beside the button.
 *
 * The course is the Full Course Script fixture's: one module, two topics,
 * three videos.
 */

export { COURSE, OUTPUT, PROJECT_DETAIL_ID, PROJECT_ID };

const data = OUTPUT.courseData;
const [topic1, topic2] = data.modules[0].topics;

/** The course's parts, keyed and numbered the way the backend reads the saved script. */
export const SEGMENTS = {
  courseIntro: segment('course-intro', 'CourseIntroduction', null, null, null, 0, 'Course introduction'),
  moduleIntro: segment('m1-intro', 'ModuleIntroduction', 1, null, null, 1, 'Module 1 introduction'),
  video1: segment('m1-t1-v1', 'TopicVideo', 1, '1', 1, 2, 'Video 1'),
  video2: segment('m1-t1-v2', 'TopicVideo', 1, '1', 2, 3, 'Video 2'),
  // Video 3 is the first video of topic 2: positions, not its number, make the key
  video3: segment('m1-t2-v1', 'TopicVideo', 1, '2', 3, 4, 'Video 3'),
  moduleConclusion: segment('m1-conclusion', 'ModuleConclusion', 1, null, null, 5, 'Module 1 conclusion'),
  courseConclusion: segment('course-conclusion', 'CourseConclusion', null, null, null, 6, 'Course conclusion')
} satisfies Record<string, Segment>;

export const SEGMENT_LIST: Segment[] = Object.values(SEGMENTS);

function segment(
  segmentKey: string,
  segmentType: Segment['segmentType'],
  moduleNumber: number | null,
  topicNumber: string | null,
  videoNumber: number | null,
  sourceOrder: number,
  segmentTitle: string
): Segment {
  return { segmentKey, segmentType, moduleNumber, topicNumber, videoNumber, sourceOrder, segmentTitle };
}

/** Each part's label in the dialogs and My Projects → Courses (COURSE_VIDEOS.SEGMENT.*). */
export const LABEL = {
  courseIntro: 'Course introduction',
  moduleIntro: 'Module 1 — Introduction',
  video3: 'Module 1 / Topic 2 / Video 3',
  moduleConclusion: 'Module 1 — Conclusion',
  courseConclusion: 'Course conclusion'
};

/** The saved script of each part, which is what a dialog starts from. */
export const SCRIPT = {
  courseIntro: data.courseIntro,
  moduleIntro: data.modules[0].moduleIntro,
  video1: topic1.videos[0].script,
  video3: topic2.videos[0].script,
  courseConclusion: data.courseConclusion
};

/** The name a video job gets: the course, then the part. */
export const jobName = (label: string) => `${COURSE.title} — ${label}`;

/** What a request names as its source: the saved course, then the part's positions. */
export const SOURCE = {
  courseIntro: { projectDetailId: PROJECT_DETAIL_ID, segmentType: 'CourseIntroduction', modulePosition: null, topicPosition: null, videoPosition: null },
  video3: { projectDetailId: PROJECT_DETAIL_ID, segmentType: 'TopicVideo', modulePosition: 1, topicPosition: 2, videoPosition: 1 }
};

/** The answers the course script was saved with, as My Projects opens it. */
export const INPUTS = {
  courseTitle: COURSE.title,
  learningGoal: COURSE.goal,
  targetAudience: COURSE.audience,
  ageMin: '20',
  ageMax: '30',
  knowledgeLevel: 'Beginner',
  language: 'English',
  numberOfModules: '1',
  numberOfTopics: '2'
};

/**
 * Opens the saved course script with the course videos API stubbed, plus the
 * avatar estimate and price (`mockVideoApi`, whose `jobs` must stay empty: a
 * course video never goes through the standalone avatar endpoint).
 */
export async function openCourseScript(app: App, screen: Screen, browser: Browser, options: CourseVideoApiOptions = {}) {
  await mockSavedProject(browser, PROJECT_ID, OUTPUT, INPUTS);
  const videos = await mockVideoApi(browser, { started: 1 });
  const api = await mockCourseVideoApi(browser, { segments: SEGMENT_LIST, ...options });
  await app.open(`${ROUTE}?projectId=${PROJECT_ID}`);
  await expect(screen.getByText(SCRIPT.video3)).toBeVisible({ timeout: 20_000 });
  // The page reads which parts already hold a video before it offers any
  await expect.poll(() => api.detailReads.length, { timeout: 20_000 }).toBeGreaterThan(0);
  return { api, videos };
}

/** The head of a course-level section or a topic video: a `role="button"` row that holds its own Generate a video. */
export function head(screen: Screen, part: 'courseIntro' | 'courseConclusion' | 1 | 2 | 3) {
  if (part === 'courseIntro') return screen.getByRole('button', /^Course Introduction/);
  if (part === 'courseConclusion') return screen.getByRole('button', /^Course Conclusion/);
  return screen.getByRole('button', new RegExp(`^${part} Video ${part}`));
}

/** The Generate a video button of a part. Module parts have plain bars, found by class. */
export function generateButton(screen: Screen, browser: Browser, part: 'courseIntro' | 'courseConclusion' | 'moduleIntro' | 1 | 2 | 3) {
  if (part === 'moduleIntro') return browser.locator('.module-header__bar .gen-module-btn');
  return head(screen, part).getByRole('button', 'Generate a video');
}

/** The video-type menu's items: their names run on into a one-line description. */
export const MENU = {
  avatar: /^Avatar Video/,
  explainer: /^Explainer Video/,
  continueDraft: /^Continue storyboard/,
  openVideo: /^Open video/
};

/** A course video dialog is named by the part it is for. */
export function courseDialog(screen: Screen, label: string) {
  return screen.getByRole('dialog', label);
}

/** The existing presenter picker, opened inside the course dialog. */
const PICKER = '.video-avatar-dialog-panel';

/**
 * Picks a presenter and a voice in the nested picker: the first ones the plan
 * can use, by class (cards are `role="button"` divs named by their portrait).
 */
export async function choosePresenter(dialog: Screen, browser: Browser): Promise<void> {
  await dialog.getByRole('button', /Choose presenter/).tap();
  const picker = browser.locator(PICKER);
  await expect(picker).toBeVisible({ timeout: 20_000 });
  await picker.getByRole('button', 'Avatar Library').tap();
  await browser.locator(`${PICKER} .vad-avatar-card:not(.is-locked)`).first().tap();
  await picker.getByRole('button', /Next/).tap();
  await picker.getByRole('button', 'Voice Library').tap();
  await browser.locator(`${PICKER} .vad-voice-card:not(.is-locked)`).first().tap();
  await picker.getByRole('button', /Generate Video/).tap();
  await expect(picker).toHaveCount(0);
}

/**
 * The explainer dialog asks the Explainer Video Agent's own questions, with the
 * part's script already in the Video Idea: every answer up to, not including,
 * Notes (which carries Generate).
 */
export const EXPLAINER_TOTAL = 10;
export const EXPLAINER_ANSWERS: Answer[] = [
  'continue', // Style, left on Realistic
  'continue', // Video Idea: the part's script, as it came
  { placeholder: EXPLAINER_PLACEHOLDER.audience, value: EXPLAINER_VIDEO.audience },
  { ages: [20, 30] },
  { choose: 'Intermediate' },
  'continue', // Voice, left on the default
  { choose: 'Portrait' },
  { press: minutes(3) },
  'skip' // Reference File
];

export { EXPLAINER_PLACEHOLDER };

/** The vocabulary of these screens, for the agent; part of the replay cache's key. */
export const COURSE_VIDEO_CONTEXT = [
  'This is the Course Script Agent in the LRNOVA dashboard, showing a finished course script.',
  'The script has a Course Introduction, modules with an introduction, topics holding numbered videos ("3 Video 3"), a module conclusion, and a Course Conclusion.',
  'Each of those parts has its own "Generate a video" button. It opens a small menu with "Avatar Video" and "Explainer Video".',
  'Choosing one opens a dialog titled with the part, e.g. "Module 1 / Topic 2 / Video 3".'
].join(' ');
