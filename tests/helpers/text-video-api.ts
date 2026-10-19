import type { Browser, WebRoute } from '@e2e-dev/web';
import type { JsonValue } from 'e2e';
import { mockVideoFile } from './tool-api.ts';

/**
 * Stubs for the explainer-video jobs API (`/api/text-video-jobs`), the
 * Text-to-Video Generator's backend.
 *
 * Two stages, both stubbed: the storyboard (`POST /storyboard`, a model call)
 * and the render (`POST /<id>/generate`, which reserves credits and queues a
 * real video). One handler answers the whole path and aborts whatever it does
 * not know, so a call a test forgot about never reaches the API.
 */

export interface StoryboardScene {
  sceneNumber: number;
  visualDescription: string;
  narration: string;
  estimatedDurationSeconds: number;
}

export interface Storyboard {
  title: string;
  scenes: StoryboardScene[];
}

export type TextVideoStatus = 'Pending' | 'StoryboardCompleted' | 'Completed' | 'Failed';

/** The ways the API says no: a refusal with a reason, a plan restriction, or an HTTP failure. */
export type Refusal =
  | { refused: string }
  | { errorType: 'InsufficientCredits' | 'SubscriptionExpired' }
  | { httpStatus: number };

/** A job as My Projects opens it, with the answers it was made from. */
export interface SavedTextVideoJob {
  id: number;
  status: TextVideoStatus;
  name?: string;
  storyboard?: Storyboard;
  errorMessage?: string;
  inputs?: Partial<Record<'prompt' | 'style' | 'orientation' | 'voice' | 'targetAudience' | 'ageMin' | 'ageMax' | 'knowledgeLevel' | 'notes', string>> & {
    estimatedDurationSeconds?: number;
  };
}

export interface TextVideoApiOptions {
  /** The id stage 1 gives the new job. */
  jobId?: number;
  /** Stage 1's answer: the storyboard, a refusal, or content that does not parse. */
  storyboard?: Storyboard | Refusal | { unreadable: true };
  /** Stage 2's answer: queued unless a refusal. */
  render?: 'queued' | Refusal;
  /** What polling a queued job reports: still `Pending` unless said otherwise. */
  status?: 'Pending' | 'Completed' | 'Failed';
  /** The reason a `Failed` status gives. */
  errorMessage?: string;
  /** A saved job, answered at `GET /<id>`. */
  job?: SavedTextVideoJob;
  /** Storyboard edits are refused rather than saved. */
  saveRefused?: boolean;
  /** Renames are refused with this as the API's message. */
  renameRefused?: string;
  /** Keep stage 1 pending until `release()`, to look at the loader. */
  hold?: boolean;
}

export interface TextVideoApiMock {
  /** Every stage-1 request (the answers), in order. */
  readonly storyboards: Record<string, unknown>[];
  /** Every stage-2 request: the job, and the storyboard it was confirmed with. */
  readonly renders: { jobId: number; storyboard: Storyboard }[];
  /** Every saved storyboard edit. */
  readonly saves: { jobId: number; storyboard: Storyboard }[];
  /** Every rename. */
  readonly renames: { jobId: number; name: string }[];
  /** Every fetch of a saved job (`GET /<id>`), answered or not, by id. */
  readonly loads: number[];
  /** Releases a stage 1 held with `{ hold: true }`. */
  release(): void;
}

/** Where a stubbed finished explainer lives; answered by `mockVideoFile`. */
export const EXPLAINER_URL = 'https://e2e-videos.invalid/explainer-video.mp4';

export const DEFAULT_JOB_ID = 5151;

function ok(data: unknown): JsonValue {
  return { succeeded: true, message: '', statusCode: 200, errorType: null, errors: null, data: data as JsonValue };
}

async function refuse(route: WebRoute, refusal: Refusal): Promise<void> {
  if ('httpStatus' in refusal) {
    await route.fulfill({ status: refusal.httpStatus, json: { title: 'Internal Server Error' } });
    return;
  }
  await route.fulfill({
    json: {
      succeeded: false,
      message: 'refused' in refusal ? refusal.refused : 'Not enough credits.',
      statusCode: 400,
      errorType: 'refused' in refusal ? 'Failure' : refusal.errorType,
      errors: null,
      data: null
    }
  });
}

function body(route: WebRoute): Record<string, unknown> {
  return route.request.postData ? JSON.parse(route.request.postData) : {};
}

function savedJob(job: SavedTextVideoJob): JsonValue {
  const inputs = job.inputs ?? {};
  return ok({
    id: job.id,
    name: job.name ?? 'Untitled',
    userId: '',
    tenantId: 0,
    videoUrl: job.status === 'Completed' ? EXPLAINER_URL : null,
    storyboardContent: job.storyboard ? JSON.stringify(job.storyboard) : null,
    status: job.status,
    createdAt: new Date().toISOString(),
    prompt: inputs.prompt ?? null,
    style: inputs.style ?? null,
    orientation: inputs.orientation ?? null,
    imageModel: 2,
    voice: inputs.voice ?? null,
    targetAudience: inputs.targetAudience ?? null,
    ageMin: inputs.ageMin ?? null,
    ageMax: inputs.ageMax ?? null,
    knowledgeLevel: inputs.knowledgeLevel ?? null,
    notes: inputs.notes ?? null,
    actualDurationSeconds: null,
    estimatedDurationSeconds: inputs.estimatedDurationSeconds ?? null,
    errorMessage: job.errorMessage ?? null
  });
}

export async function mockTextVideoApi(browser: Browser, options: TextVideoApiOptions): Promise<TextVideoApiMock> {
  const storyboards: Record<string, unknown>[] = [];
  const renders: { jobId: number; storyboard: Storyboard }[] = [];
  const saves: { jobId: number; storyboard: Storyboard }[] = [];
  const renames: { jobId: number; name: string }[] = [];
  const loads: number[] = [];
  const jobId = options.jobId ?? DEFAULT_JOB_ID;

  let release = () => {};
  const held = options.hold ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve();

  await mockVideoFile(browser);
  await browser.route('**/api/video/preview-cost', async (route) => {
    await route.fulfill({ json: ok({ estimatedCredits: 5, availableCredits: 500 }) });
  });

  await browser.route('**/api/text-video-jobs/**', async (route) => {
    const { method } = route.request;
    const path = new URL(route.request.url).pathname.replace(/^.*\/api\/text-video-jobs/, '');
    const id = Number(path.split('/')[1]);

    if (method === 'POST' && path === '/storyboard') {
      storyboards.push(body(route));
      await held;
      const answer = options.storyboard;
      if (!answer) {
        await route.abort();
      } else if ('scenes' in answer) {
        await route.fulfill({ json: ok({ textVideoJobId: jobId, storyboardContent: JSON.stringify(answer) }) });
      } else if ('unreadable' in answer) {
        await route.fulfill({ json: ok({ textVideoJobId: jobId, storyboardContent: 'The storyboard, in prose.' }) });
      } else {
        await refuse(route, answer);
      }
      return;
    }

    if (method === 'POST' && /^\/\d+\/generate$/.test(path)) {
      renders.push({ jobId: id, storyboard: JSON.parse(String(body(route).storyboardContent ?? '{}')) });
      const render = options.render ?? 'queued';
      if (render === 'queued') {
        await route.fulfill({ json: ok({ textVideoJobId: id, status: 'Pending' }) });
      } else {
        await refuse(route, render);
      }
      return;
    }

    if (method === 'GET' && /^\/\d+\/status$/.test(path)) {
      const status = options.status ?? 'Pending';
      await route.fulfill({
        json: ok({
          status,
          videoUrl: status === 'Completed' ? EXPLAINER_URL : null,
          errorMessage: status === 'Failed' ? (options.errorMessage ?? null) : null
        })
      });
      return;
    }

    if (method === 'PUT' && /^\/\d+\/storyboard$/.test(path)) {
      saves.push({ jobId: id, storyboard: JSON.parse(String(body(route).storyboardContent ?? '{}')) });
      await route.fulfill({
        json: options.saveRefused
          ? { succeeded: false, message: 'Not saved.', statusCode: 400, errorType: 'Failure', errors: null, data: null }
          : ok(true)
      });
      return;
    }

    if (method === 'PUT' && /^\/\d+\/name$/.test(path)) {
      const name = String(body(route).name);
      renames.push({ jobId: id, name });
      await route.fulfill({
        json: options.renameRefused
          ? { succeeded: false, message: options.renameRefused, statusCode: 400, errorType: 'Failure', errors: null, data: null }
          : ok({ name })
      });
      return;
    }

    if (method === 'GET' && /^\/\d+$/.test(path)) {
      loads.push(id);
      if (options.job && id === options.job.id) {
        await route.fulfill({ json: savedJob(options.job) });
        return;
      }
    }

    await route.abort();
  });

  return { storyboards, renders, saves, renames, loads, release: () => release() };
}
