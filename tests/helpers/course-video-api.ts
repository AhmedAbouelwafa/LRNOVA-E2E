import type { Browser, WebRoute } from '@e2e-dev/web';
import type { JsonValue } from 'e2e';
import { PROJECT_DETAIL_ID } from './tool-api.ts';
import { DEFAULT_JOB_ID, type Storyboard, type TextVideoApiMock } from './text-video-api.ts';

/**
 * Stubs for the Course Videos API (`/api/course-videos`): the avatar and
 * explainer videos made from one part ("segment") of a Full Course Script, and
 * the My Projects → Courses lists.
 *
 * A segment holds one video. The stub keeps that rule the way the server does:
 * an accepted request links its video to the segment, and the next status read
 * (`GET /by-detail/<id>`) reports it. One handler answers the whole path and
 * aborts whatever it does not know, so nothing reaches the real API — a real
 * avatar request renders a video and spends the account's credits.
 *
 * The explainer's second stage (the video itself) goes to the existing
 * `/api/text-video-jobs/<id>/generate`, which `mockTextVideoApi` answers; hand
 * that mock in as `textApi` and a confirmed storyboard reads back as generating.
 */

export type SegmentType = 'CourseIntroduction' | 'CourseConclusion' | 'ModuleIntroduction' | 'ModuleConclusion' | 'TopicVideo';
export type VideoType = 'Avatar' | 'Explainer';
export type VideoPhase = 'Ready' | 'Generating' | 'Submitting' | 'Unconfirmed' | 'Draft' | 'Failed';
type SubmissionState = 'Accepted' | 'Submitting' | 'Unconfirmed' | 'Failed';
type DispatchState = 'NotRequested' | 'Submitting' | 'Accepted' | 'Failed';

/** One part of a course a video can be made from, with the numbers the script shows. */
export interface Segment {
  segmentKey: string;
  segmentType: SegmentType;
  moduleNumber: number | null;
  topicNumber: string | null;
  videoNumber: number | null;
  sourceOrder: number;
  segmentTitle: string;
}

export interface CourseVideo {
  courseVideoId: number;
  videoType: VideoType;
  jobId: number;
  jobName: string;
  jobStatus: string;
  state: SubmissionState;
  dispatch: DispatchState | null;
  phase: VideoPhase;
  jobDeleted: boolean;
  createdAt: string;
  sourceChanged: boolean | null;
}

export interface SegmentVideo extends Segment {
  projectDetailId: number;
  video: CourseVideo;
}

export interface CourseListItem {
  projectId: number;
  latestProjectDetailId: number;
  name: string | null;
  lastActivityAt: string;
  segmentsWithVideos: number;
  readySegments: number;
  inProgressSegments: number;
  draftSegments: number;
  attentionSegments: number;
  isDraftOnly: boolean;
}

export interface CourseDetail {
  projectId: number;
  latestProjectDetailId: number;
  name: string | null;
  projectDetails: { projectDetailId: number; segments: SegmentVideo[] }[];
}

/** The ways the API answers a create request. */
export type Outcome =
  | 'accepted' // queued: the segment now holds the video
  | 'unconfirmed' // linked, but the queue has not confirmed it yet
  | 'occupied' // COURSE_SEGMENT_OCCUPIED: the segment already holds a video (`occupant`)
  | { refused: string } // a definitive refusal; the segment stays free
  | { errorType: 'InsufficientCredits' | 'SubscriptionExpired' }
  | { httpStatus: number }; // no envelope: lost in transport, as far as the page can tell

/** The source the page sent: the segment's type and 1-based positions in the saved course. */
export interface Source {
  projectDetailId: number;
  segmentType: SegmentType;
  modulePosition: number | null;
  topicPosition: number | null;
  videoPosition: number | null;
}

export interface CourseVideoApiOptions {
  /** Every part of the open course, so an accepted request knows what it linked to. */
  segments?: Segment[];
  /** Videos already linked when the page first reads the course. */
  linked?: SegmentVideo[];
  /** How `POST /avatar` answers; a list answers in turn, its last entry from then on. */
  avatar?: Outcome | Outcome[];
  /** How `POST /explainer/storyboard` answers: a storyboard is success. */
  storyboard?: Storyboard | Exclude<Outcome, 'accepted' | 'unconfirmed'> | (Storyboard | Exclude<Outcome, 'accepted' | 'unconfirmed'>)[];
  /** The video an `occupied` answer finds on the segment (someone else's request won). */
  occupant?: SegmentVideo;
  /** The text-video mock the explainer's confirm goes through; a render there reads back as generating. */
  textApi?: TextVideoApiMock;
  /** Job ids the stub hands out. */
  avatarJobId?: number;
  explainerJobId?: number;
  /** My Projects → Courses: the cards, or an HTTP failure. */
  courses?: CourseListItem[] | { httpStatus: number };
  /** My Projects → Courses: each course's detail, by project id; any other id is refused. */
  details?: Record<number, CourseDetail>;
}

export interface CourseVideoApiMock {
  /** Every `POST /avatar` body, in order. */
  readonly avatars: Record<string, unknown>[];
  /** Every `POST /explainer/storyboard` body, in order. */
  readonly storyboards: Record<string, unknown>[];
  /** Every status read (`GET /by-detail/<id>`), by project detail id. */
  readonly detailReads: number[];
  /** Every course list request's URL. */
  readonly listRequests: URL[];
  /** Every course detail read, by project id. */
  readonly courseReads: number[];
  /** What the segments hold right now, by segment key. */
  readonly linked: Map<string, SegmentVideo>;
}

export const DEFAULT_AVATAR_JOB_ID = 6161;
export const SEGMENT_OCCUPIED = 'COURSE_SEGMENT_OCCUPIED';

/** The positional key the backend uses: `course-intro`, `m1-intro`, `m1-t2-v1`, … */
export function segmentKey(source: Omit<Source, 'projectDetailId'>): string {
  switch (source.segmentType) {
    case 'CourseIntroduction':
      return 'course-intro';
    case 'CourseConclusion':
      return 'course-conclusion';
    case 'ModuleIntroduction':
      return `m${source.modulePosition}-intro`;
    case 'ModuleConclusion':
      return `m${source.modulePosition}-conclusion`;
    case 'TopicVideo':
      return `m${source.modulePosition}-t${source.topicPosition}-v${source.videoPosition}`;
  }
}

let nextCourseVideoId = 40_000;

/** A video linked to `segment`; the defaults are an avatar that is ready. */
export function linkedVideo(
  segment: Segment,
  video: Partial<CourseVideo> & { videoType?: VideoType; phase?: VideoPhase; jobId: number },
  projectDetailId = PROJECT_DETAIL_ID
): SegmentVideo {
  const phase = video.phase ?? 'Ready';
  const videoType = video.videoType ?? 'Avatar';
  const draft = videoType === 'Explainer' && phase === 'Draft';
  return {
    ...segment,
    projectDetailId,
    video: {
      courseVideoId: nextCourseVideoId++,
      jobName: `E2E — ${segment.segmentTitle}`,
      jobStatus: phase === 'Ready' ? 'Completed' : 'Pending',
      state: phase === 'Submitting' ? 'Submitting' : phase === 'Unconfirmed' ? 'Unconfirmed' : 'Accepted',
      dispatch: videoType === 'Explainer' ? (draft ? 'NotRequested' : 'Accepted') : null,
      jobDeleted: false,
      createdAt: '2026-10-20T10:00:00Z',
      sourceChanged: false,
      ...video,
      videoType,
      phase
    }
  };
}

function ok(data: unknown): JsonValue {
  return { succeeded: true, message: '', statusCode: 200, errorType: null, errors: null, data: data as JsonValue };
}

function envelope(message: string, errorType: string, code: string | null = null): JsonValue {
  return { succeeded: false, message, statusCode: 400, errorType, errors: null, code, data: null };
}

function body(route: WebRoute): Record<string, unknown> {
  return route.request.postData ? JSON.parse(route.request.postData) : {};
}

/** Takes the answers in turn; the last one stays. */
function sequence<T>(answers: T | T[] | undefined): () => T | undefined {
  const list = answers === undefined ? [] : Array.isArray(answers) ? answers : [answers];
  let index = 0;
  return () => list[Math.min(index++, list.length - 1)];
}

function isStoryboard(value: unknown): value is Storyboard {
  return !!value && typeof value === 'object' && 'scenes' in value;
}

/** Pages `items` the way the API does, after narrowing them by `search`. */
function page(url: URL, items: CourseListItem[]): JsonValue {
  const pageNumber = Number(url.searchParams.get('pageNumber') ?? 1);
  const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
  const search = (url.searchParams.get('search') ?? '').toLowerCase();
  const matching = items.filter((item) => (item.name ?? '').toLowerCase().includes(search));
  const totalPages = Math.max(1, Math.ceil(matching.length / pageSize));
  return ok({
    items: matching.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
    pageNumber,
    pageSize,
    totalCount: matching.length,
    totalPages,
    hasPreviousPage: pageNumber > 1,
    hasNextPage: pageNumber < totalPages
  });
}

export async function mockCourseVideoApi(browser: Browser, options: CourseVideoApiOptions = {}): Promise<CourseVideoApiMock> {
  const avatars: Record<string, unknown>[] = [];
  const storyboards: Record<string, unknown>[] = [];
  const detailReads: number[] = [];
  const listRequests: URL[] = [];
  const courseReads: number[] = [];
  const linked = new Map<string, SegmentVideo>((options.linked ?? []).map((s) => [s.segmentKey, s]));
  const nextAvatar = sequence(options.avatar);
  const nextStoryboard = sequence(options.storyboard);

  /** The course part a request names, from the catalogue (or built from its positions). */
  function segmentFor(source: Source): Segment {
    const key = segmentKey(source);
    return (
      options.segments?.find((s) => s.segmentKey === key) ?? {
        segmentKey: key,
        segmentType: source.segmentType,
        moduleNumber: source.modulePosition,
        topicNumber: source.topicPosition === null ? null : String(source.topicPosition),
        videoNumber: source.videoPosition,
        sourceOrder: 0,
        segmentTitle: key
      }
    );
  }

  /** What the segment's video looks like now: a confirmed explainer storyboard is generating. */
  function current(segment: SegmentVideo): SegmentVideo {
    const { video } = segment;
    const rendered = options.textApi?.renders.some((r) => r.jobId === video.jobId);
    if (video.videoType === 'Explainer' && video.phase === 'Draft' && rendered) {
      return { ...segment, video: { ...video, phase: 'Generating', dispatch: 'Accepted' } };
    }
    return segment;
  }

  function submission(link: SegmentVideo, storyboard: Storyboard | null): JsonValue {
    const { video, projectDetailId, ...segment } = link;
    return ok({
      courseVideoId: video.courseVideoId,
      projectDetailId,
      videoType: video.videoType,
      state: video.state,
      dispatch: video.dispatch,
      jobId: video.jobId,
      jobStatus: video.jobStatus,
      errorMessage: null,
      storyboardContent: storyboard ? JSON.stringify(storyboard) : null,
      segment
    });
  }

  /** Answers a refusal, an occupied segment, or a transport failure. */
  async function refuse(route: WebRoute, outcome: Exclude<Outcome, 'accepted' | 'unconfirmed'>, key: string): Promise<void> {
    if (outcome === 'occupied') {
      if (options.occupant) linked.set(key, options.occupant);
      await route.fulfill({ status: 409, json: envelope('This part already has a video.', 'Conflict', SEGMENT_OCCUPIED) });
    } else if ('httpStatus' in outcome) {
      await route.fulfill({ status: outcome.httpStatus, json: { title: 'Bad Gateway' } });
    } else if ('refused' in outcome) {
      await route.fulfill({ status: 400, json: envelope(outcome.refused, 'Failure') });
    } else {
      await route.fulfill({ status: 400, json: envelope('Not enough credits.', outcome.errorType) });
    }
  }

  await browser.route('**/api/course-videos/**', async (route) => {
    const { method } = route.request;
    const url = new URL(route.request.url);
    const path = url.pathname.replace(/^.*\/api\/course-videos/, '');

    if (method === 'POST' && path === '/avatar') {
      const request = body(route);
      avatars.push(request);
      const source = request.source as Source;
      const key = segmentKey(source);
      const outcome = nextAvatar();
      if (!outcome) {
        await route.abort();
      } else if (outcome === 'accepted' || outcome === 'unconfirmed') {
        const link = linkedVideo(
          segmentFor(source),
          {
            videoType: 'Avatar',
            jobId: options.avatarJobId ?? DEFAULT_AVATAR_JOB_ID,
            jobName: String(request.jobName),
            phase: outcome === 'accepted' ? 'Generating' : 'Submitting'
          },
          source.projectDetailId
        );
        linked.set(key, link);
        await route.fulfill({ json: submission(link, null) });
      } else {
        await refuse(route, outcome, key);
      }
      return;
    }

    if (method === 'POST' && path === '/explainer/storyboard') {
      const request = body(route);
      storyboards.push(request);
      const source = request.source as Source;
      const key = segmentKey(source);
      const outcome = nextStoryboard();
      if (!outcome) {
        await route.abort();
      } else if (isStoryboard(outcome)) {
        const link = linkedVideo(
          segmentFor(source),
          { videoType: 'Explainer', phase: 'Draft', jobId: options.explainerJobId ?? DEFAULT_JOB_ID, jobName: String(request.jobName) },
          source.projectDetailId
        );
        linked.set(key, link);
        await route.fulfill({ json: submission(link, outcome) });
      } else {
        await refuse(route, outcome, key);
      }
      return;
    }

    const byDetail = /^\/by-detail\/(\d+)$/.exec(path);
    if (method === 'GET' && byDetail) {
      const id = Number(byDetail[1]);
      detailReads.push(id);
      const segments = [...linked.values()].filter((s) => s.projectDetailId === id).map(current);
      await route.fulfill({ json: ok({ projectId: 0, projectDetailId: id, segments }) });
      return;
    }

    if (method === 'GET' && path === '/courses') {
      listRequests.push(url);
      const courses = options.courses ?? [];
      if ('httpStatus' in courses) {
        await route.fulfill({ status: courses.httpStatus, json: { title: 'Internal Server Error' } });
      } else {
        await route.fulfill({ json: page(url, courses) });
      }
      return;
    }

    const course = /^\/courses\/(\d+)$/.exec(path);
    if (method === 'GET' && course) {
      const id = Number(course[1]);
      courseReads.push(id);
      const detail = options.details?.[id];
      await route.fulfill(
        detail ? { json: ok(detail) } : { status: 404, json: envelope('Course not found.', 'NotFound') }
      );
      return;
    }

    await route.abort();
  });

  return { avatars, storyboards, detailReads, listRequests, courseReads, linked };
}
