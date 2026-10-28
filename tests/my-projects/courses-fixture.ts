import { linkedVideo, type CourseDetail, type CourseListItem } from '../helpers/course-video-api.ts';
import { savedJob } from '../tools/text-to-video-generator/fixture.ts';
import { SEGMENTS } from '../course-videos/fixture.ts';

/**
 * My Projects → Courses: one card per course that has course videos, and a
 * course's videos in the course's own order. The lists are stubbed; the
 * videos open on their real tool pages, with their jobs stubbed.
 */

export const COURSES_TAB = 'Courses';

export const MAIN_COURSE_ID = 880_101;
const MAIN_LATEST = 990_201;
const MAIN_EARLIER = 990_200;
export const DRAFT_COURSE_ID = 880_102;

/** The ready explainer of Video 3, as the explainer page opens it. */
export const EXPLAINER_JOB = savedJob('Completed');

export const JOB = {
  introAvatar: 7101,
  conclusionAvatar: 7102,
  earlierAvatar: 7103
};

export const COURSES: CourseListItem[] = [
  {
    projectId: MAIN_COURSE_ID,
    latestProjectDetailId: MAIN_LATEST,
    name: 'Time Management Basics',
    lastActivityAt: '2026-10-20T10:00:00Z',
    segmentsWithVideos: 4,
    readySegments: 2,
    inProgressSegments: 1,
    draftSegments: 1,
    attentionSegments: 0,
    isDraftOnly: false
  },
  {
    projectId: DRAFT_COURSE_ID,
    latestProjectDetailId: 990_301,
    name: 'Onboarding Essentials',
    lastActivityAt: '2026-10-18T10:00:00Z',
    segmentsWithVideos: 1,
    readySegments: 0,
    inProgressSegments: 0,
    draftSegments: 1,
    attentionSegments: 0,
    isDraftOnly: true
  },
  {
    projectId: 880_103,
    latestProjectDetailId: 990_401,
    name: null,
    lastActivityAt: '2026-10-15T10:00:00Z',
    segmentsWithVideos: 1,
    readySegments: 0,
    inProgressSegments: 0,
    draftSegments: 0,
    attentionSegments: 1,
    isDraftOnly: false
  }
];

/**
 * The main course: its latest version holds four videos — two ready (the
 * course introduction, an avatar; Video 3, an explainer), a draft and one
 * still generating — and an earlier version holds one more.
 */
export const DETAILS: Record<number, CourseDetail> = {
  [MAIN_COURSE_ID]: {
    projectId: MAIN_COURSE_ID,
    latestProjectDetailId: MAIN_LATEST,
    name: 'Time Management Basics',
    projectDetails: [
      {
        projectDetailId: MAIN_LATEST,
        // Out of order on purpose: the page sorts by the course's own order
        segments: [
          linkedVideo(SEGMENTS.courseConclusion, { videoType: 'Avatar', phase: 'Generating', jobId: JOB.conclusionAvatar }, MAIN_LATEST),
          linkedVideo(SEGMENTS.video3, { videoType: 'Explainer', phase: 'Ready', jobId: EXPLAINER_JOB.id }, MAIN_LATEST),
          linkedVideo(SEGMENTS.courseIntro, { videoType: 'Avatar', phase: 'Ready', jobId: JOB.introAvatar, jobName: 'Course intro clip' }, MAIN_LATEST),
          linkedVideo(SEGMENTS.moduleIntro, { videoType: 'Explainer', phase: 'Draft', jobId: 7104 }, MAIN_LATEST)
        ]
      },
      {
        projectDetailId: MAIN_EARLIER,
        segments: [linkedVideo(SEGMENTS.moduleConclusion, { videoType: 'Avatar', phase: 'Ready', jobId: JOB.earlierAvatar }, MAIN_EARLIER)]
      }
    ]
  },
  [DRAFT_COURSE_ID]: {
    projectId: DRAFT_COURSE_ID,
    latestProjectDetailId: 990_301,
    name: 'Onboarding Essentials',
    projectDetails: [
      {
        projectDetailId: 990_301,
        segments: [linkedVideo(SEGMENTS.courseIntro, { videoType: 'Explainer', phase: 'Draft', jobId: 7201 }, 990_301)]
      }
    ]
  }
};

export const coursesUrl = (course?: number) => `/my-projects?tab=courses${course ? `&course=${course}` : ''}`;
