import type { Browser, WebRoute } from '@e2e-dev/web';
import type { JsonValue } from 'e2e';

/**
 * Stubs for the text tools' backend, so a run never spends the account's
 * credits and every generation ends on the same document.
 *
 * Determinism is what the replay cache needs: a recorded step is checked
 * against the controls it made appear, so a real model writing three videos one
 * run and four the next would hand every replay back to the agent.
 *
 * Each tool posts to `/api/<Endpoint>/create-or-regenerate` and saves edits with
 * a PUT to `/api/<Endpoint>/update`; both wrap the document as a JSON string in
 * `outputPayloadJson`. The tool's schema (`/api/Tools/get-by-id/<id>`) is left
 * on the network so the questions on screen are the real ones.
 */

export const PROJECT_ID = 990_001;
export const PROJECT_DETAIL_ID = 990_101;

/** What the page sent, parsed: `inputParametersJson` arrives as a JSON string. */
export interface RunRequest {
  toolId: number;
  projectId: number | null;
  inputs: Record<string, unknown>;
}

export interface UpdateRequest {
  projectId: number;
  projectDetailId: number;
  output: Record<string, unknown>;
}

export interface ToolApiMock {
  /** Every generate/regenerate call, in order. */
  readonly runs: RunRequest[];
  /** Every save of an edited document, in order. */
  readonly updates: UpdateRequest[];
  /** Every project rename, in order. */
  readonly renames: { projectId: number; name: string }[];
  /** Releases generations held with `{ hold: true }`. */
  release(): void;
}

export interface MockOptions {
  /** Keep generate calls pending until `release()`, to look at the loading state. */
  hold?: boolean;
}

/** The API's envelope around a successful answer. */
function ok(data: unknown): JsonValue {
  return { succeeded: true, message: '', statusCode: 200, errorType: null, errors: null, data: data as JsonValue };
}

function body(route: WebRoute): Record<string, unknown> {
  return route.request.postData ? JSON.parse(route.request.postData) : {};
}

/**
 * Answers the tool's generate, update and rename calls with `output`.
 *
 * `output` may be a function of the run, for a regenerate that has to come back
 * different from the first document (a refine, say). Update echoes the edited
 * document back, the way the API does, so a saved edit is what the canvas
 * shows next.
 */
export async function mockToolApi(
  browser: Browser,
  endpoint: string,
  output: unknown | ((run: RunRequest, index: number) => unknown),
  options: MockOptions = {}
): Promise<ToolApiMock> {
  const runs: RunRequest[] = [];
  const updates: UpdateRequest[] = [];
  const renames: { projectId: number; name: string }[] = [];

  let release = () => {};
  const held = options.hold ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve();

  await browser.route(`**/api/${endpoint}/create-or-regenerate`, async (route) => {
    const request = body(route);
    const inputs = JSON.parse(String(request.inputParametersJson ?? '{}'));
    const run: RunRequest = { toolId: Number(request.toolId), projectId: (request.projectId as number) ?? null, inputs };
    runs.push(run);
    const document = typeof output === 'function' ? output(run, runs.length - 1) : output;
    await held;
    await route.fulfill({
      json: ok({
        toolId: request.toolId,
        projectId: PROJECT_ID,
        projectDetailId: PROJECT_DETAIL_ID,
        inputParametersJson: request.inputParametersJson,
        outputPayloadJson: JSON.stringify(document)
      })
    });
  });

  await browser.route(`**/api/${endpoint}/update`, async (route) => {
    const request = body(route);
    const saved = String(request.outputPayloadJson ?? '{}');
    updates.push({
      projectId: Number(request.projectId),
      projectDetailId: Number(request.projectDetailId),
      output: JSON.parse(saved)
    });
    await route.fulfill({
      json: ok({
        toolId: 0,
        projectId: request.projectId,
        projectDetailId: request.projectDetailId,
        inputParametersJson: '{}',
        outputPayloadJson: saved
      })
    });
  });

  await browser.route('**/api/Projects/update-name', async (route) => {
    const request = body(route);
    renames.push({ projectId: Number(request.projectId), name: String(request.name) });
    await route.fulfill({ json: ok({ projectId: request.projectId, name: request.name }) });
  });

  return {
    runs,
    updates,
    renames,
    release: () => release()
  };
}

/**
 * Answers the generate call with a refusal: `succeeded: false`, and an
 * `errorType` such as `InsufficientCredits` when the test wants the upgrade path.
 */
export async function mockToolFailure(
  browser: Browser,
  endpoint: string,
  failure: { message: string; errorType?: string | null }
): Promise<void> {
  await browser.route(`**/api/${endpoint}/create-or-regenerate`, async (route) => {
    await route.fulfill({
      json: {
        succeeded: false,
        message: failure.message,
        statusCode: 400,
        errorType: failure.errorType ?? 'Failure',
        errors: null,
        data: null
      }
    });
  });
}

export interface VideoApiMock {
  /** Every video job the page asked for (`/api/VideoGenerationTool/execute`), parsed. */
  readonly jobs: Record<string, unknown>[];
}

/**
 * Stubs the avatar-video calls a text tool makes, and makes sure none of them
 * reaches the API: a real one renders a video and spends the account's credits.
 *
 * - `estimate-duration` / `preview-cost`: priced as affordable, the script
 *   read as `estimatedSeconds` long (45 unless said otherwise)
 * - `execute`: `outcome` decides — a started job (`jobId`), a refusal, a
 *   refusal for credits, or a failure at the HTTP level (`httpStatus`)
 * - `job-status`: `status` decides — still `Pending` unless said otherwise;
 *   `Completed` comes back with `VIDEO_URL`
 */
export async function mockVideoApi(
  browser: Browser,
  outcome:
    | { started: number }
    | { refused: string }
    | { errorType: 'InsufficientCredits' | 'SubscriptionExpired' }
    | { httpStatus: number },
  options: { status?: VideoJobStatus; estimatedSeconds?: number } = {}
): Promise<VideoApiMock> {
  const jobs: Record<string, unknown>[] = [];

  await browser.route('**/api/video/estimate-duration', async (route) => {
    await route.fulfill({ json: ok({ estimatedDurationSeconds: options.estimatedSeconds ?? 45 }) });
  });
  await browser.route('**/api/video/preview-cost', async (route) => {
    await route.fulfill({ json: ok({ estimatedCredits: 5, availableCredits: 500 }) });
  });
  await browser.route('**/api/VideoGenerationTool/job-status/**', async (route) => {
    const status = options.status ?? 'Pending';
    await route.fulfill({ json: ok({ status, videoUrl: status === 'Completed' ? VIDEO_URL : null, audioOutputPath: null }) });
  });
  await mockVideoFile(browser);
  await browser.route('**/api/VideoGenerationTool/execute', async (route) => {
    jobs.push(body(route));
    if ('started' in outcome) {
      await route.fulfill({ json: ok({ jobId: outcome.started }) });
      return;
    }
    if ('httpStatus' in outcome) {
      await route.fulfill({ status: outcome.httpStatus, json: { title: 'Internal Server Error' } });
      return;
    }
    await route.fulfill({
      json: {
        succeeded: false,
        message: 'refused' in outcome ? outcome.refused : 'Not enough credits.',
        statusCode: 400,
        errorType: 'refused' in outcome ? 'Failure' : outcome.errorType,
        errors: null,
        data: null
      }
    });
  });

  return { jobs };
}

export type VideoJobStatus = 'Pending' | 'Completed' | 'Failed';

/** Where a stubbed finished video lives; answered by `mockVideoFile`. */
export const VIDEO_URL = 'https://e2e-videos.invalid/avatar-video.mp4';

/** Answers the player's request for `VIDEO_URL` (or any stubbed video), so no test reaches out for a file. */
export async function mockVideoFile(browser: Browser): Promise<void> {
  await browser.route('https://e2e-videos.invalid/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'video/mp4', body: '' });
  });
}

/**
 * A video job as My Projects opens it: `/api/VideoGenerationTool/job/<id>`,
 * with the answers it was made from (script or audio, presenter, voice).
 */
export async function mockVideoJob(
  browser: Browser,
  job: { id: number; status: VideoJobStatus; name?: string; script?: string; audioUrl?: string; errorMessage?: string }
): Promise<void> {
  await mockVideoFile(browser);
  await browser.route(`**/api/VideoGenerationTool/job/${job.id}`, async (route) => {
    await route.fulfill({
      json: ok({
        id: job.id,
        name: job.name ?? null,
        status: job.status,
        videoUrl: job.status === 'Completed' ? VIDEO_URL : null,
        audioOutputPath: null,
        errorMessage: job.errorMessage ?? null,
        script: job.script ?? null,
        audioUrl: job.audioUrl ?? null,
        avatarName: 'Alex',
        voiceName: 'en-US-Ava',
        videoGenerationType: 'low_model'
      })
    });
  });
}

/**
 * Answers a video's rename (`/api/VideoGenerationTool/update-job-name`): saved,
 * or refused with `refused` as the API's message.
 */
export async function mockVideoRename(browser: Browser, refused?: string): Promise<{ renames: Record<string, unknown>[] }> {
  const renames: Record<string, unknown>[] = [];
  await browser.route('**/api/VideoGenerationTool/update-job-name', async (route) => {
    const request = body(route);
    renames.push(request);
    await route.fulfill({
      json: refused
        ? { succeeded: false, message: refused, statusCode: 400, errorType: 'Failure', errors: null, data: null }
        : ok({ jobId: request.jobId, name: request.name })
    });
  });
  return { renames };
}

/**
 * A guard for tests that never mean to start a video: any request to start one
 * is aborted rather than sent. Registered first, so a test's own
 * `mockVideoApi` (registered later) answers instead.
 */
export async function blockVideoRenders(browser: Browser): Promise<void> {
  await browser.route('**/api/VideoGenerationTool/execute', async (route) => {
    await route.abort();
  });
}

/**
 * Fails the generate call at the HTTP level — a 500 with no API envelope —
 * the way an outage or a crashed backend answers. Angular then raises an
 * error rather than handing the page a response, which is a different path
 * from `mockToolFailure`'s refusal.
 */
export async function mockToolHttpFailure(browser: Browser, endpoint: string, status = 500): Promise<void> {
  await browser.route(`**/api/${endpoint}/create-or-regenerate`, async (route) => {
    await route.fulfill({ status, json: { title: 'Internal Server Error' } });
  });
}

/** Where a stubbed upload claims the file now lives; sent as `referenceLink`. */
export const UPLOADED_FILE_URL = 'https://e2e-uploads.invalid/reference.txt';

/** Where a stubbed audio upload claims the recording now lives; sent as `audioUrl`. */
export const UPLOADED_AUDIO_URL = 'https://e2e-uploads.invalid/narration.wav';

/**
 * Stubs the uploads: the Reference File's presigned URL
 * (`/api/Files/presigned-url`), the audio route's (`/api/Files/audio-presigned-url`),
 * and the PUT to the bucket they name, so nothing lands in the real S3 bucket.
 */
export async function mockUpload(browser: Browser): Promise<void> {
  await browser.route('**/api/Files/presigned-url', async (route) => {
    await route.fulfill({
      json: ok({ uploadUrl: 'https://e2e-uploads.invalid/put/reference.txt', fileUrl: UPLOADED_FILE_URL })
    });
  });
  await browser.route('**/api/Files/audio-presigned-url', async (route) => {
    await route.fulfill({
      json: ok({ uploadUrl: 'https://e2e-uploads.invalid/put/narration.wav', fileUrl: UPLOADED_AUDIO_URL })
    });
  });
  await browser.route('https://e2e-uploads.invalid/**', async (route) => {
    await route.fulfill({ status: 200, body: '' });
  });
}

/**
 * Serves a saved project the way My Projects opens one:
 * `/api/Projects/projects/<id>/latest`.
 */
export async function mockSavedProject(
  browser: Browser,
  projectId: number,
  output: unknown,
  inputs: Record<string, unknown>
): Promise<void> {
  await browser.route(`**/api/Projects/projects/${projectId}/latest`, async (route) => {
    await route.fulfill({
      json: ok({
        projectId,
        projectDetailId: PROJECT_DETAIL_ID,
        jsonContent: JSON.stringify(output),
        inputParametersJson: JSON.stringify(inputs)
      })
    });
  });
}
