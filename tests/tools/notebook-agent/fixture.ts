import type { Browser, WebRoute } from '@e2e-dev/web';
import type { JsonValue, Screen } from 'e2e';
import { expect } from 'e2e';
import { option, progress } from '../../helpers/questionnaire.ts';
import { PROJECT_DETAIL_ID, PROJECT_ID } from '../../helpers/tool-api.ts';

/**
 * Notebook Agent — study notebooks in two stages.
 *
 * Eleven questions of its own (the same step panels as the text tools), then
 * the notebook's content as markdown, then — on request — a designed PDF of
 * it. The content goes through the shared tool endpoints (`/api/NotebookTool/
 * create-or-regenerate` and `/update`, stubbed with `mockToolApi`); the PDF
 * spends credits and is stubbed here (`mockNotebookPdf`), along with the
 * project state My Projects reopens.
 */
export const TOOL_ID = 13;
export const ROUTE = '/tools/notebook-agent';
export const ENDPOINT = 'NotebookTool';
export const TOOL_NAME = 'Notebook Agent';

export const TOTAL = 11;

export const PLACEHOLDER = {
  subject: 'e.g. Mathematics',
  topicTitle: 'e.g. Introduction to Algebra',
  grade: 'e.g. Grade 8',
  creatorName: 'e.g. Prof. Ahmed',
  extraNotes: 'Add any additional instructions...'
};

export const NOTEBOOK = {
  subject: 'Mathematics',
  topicTitle: 'Linear Equations',
  grade: 'Grade 8',
  creatorName: 'Prof. Sara'
};

async function type(screen: Screen, placeholder: string, value: string) {
  await screen.getByPlaceholder(placeholder).fill(value);
  await screen.getByRole('button', 'Continue').tap();
}

/** The style question's button, and its popup's confirm button too. */
export const CHOOSE_STYLE = 'Choose a style';

/** Picks a theme in its popup; the popup's confirm button reads "Choose a style" too. */
export async function pickTheme(screen: Screen, name: string) {
  await screen.getByRole('button', CHOOSE_STYLE).tap();
  const dialog = screen.getByRole('dialog');
  await dialog.getByRole('button', new RegExp(`^${name}`)).tap();
  await dialog.getByRole('button', CHOOSE_STYLE).tap();
  await expect(screen.getByRole('dialog')).toHaveCount(0);
}

/**
 * The answers, one step each, in the order asked: the style first, then the
 * rest. The last one (Extra Notes) carries Generate and is the test's to press.
 */
export const STEPS: ((screen: Screen) => Promise<void>)[] = [
  async (s) => {
    await pickTheme(s, 'Watercolor');
    await s.getByRole('button', 'Continue').tap();
  },
  (s) => type(s, PLACEHOLDER.subject, NOTEBOOK.subject),
  (s) => type(s, PLACEHOLDER.topicTitle, NOTEBOOK.topicTitle),
  (s) => option(s, 'Intermediate').tap(), // Topic level, picked
  (s) => type(s, PLACEHOLDER.grade, NOTEBOOK.grade),
  (s) => option(s, 'English').tap(),
  (s) => s.getByRole('button', 'Continue').tap(), // Detail level, left on Concise
  (s) => type(s, PLACEHOLDER.creatorName, NOTEBOOK.creatorName),
  (s) => s.getByRole('button', 'Continue').tap(), // Cover, left on
  (s) => s.getByRole('button', 'Skip').tap() // Reference file
];

/** Answers the first `count` questions, checking the counter after each. */
export async function answerIntake(screen: Screen, count = STEPS.length): Promise<void> {
  for (let i = 0; i < count; i++) {
    await STEPS[i](screen);
    await expect(progress(screen, i + 1, TOTAL)).toBeVisible();
  }
}

/** What those answers send. */
export const INPUTS = {
  subject: NOTEBOOK.subject,
  topicTitle: NOTEBOOK.topicTitle,
  topicLevel: 'intermediate',
  grade: NOTEBOOK.grade,
  language: 'english',
  detailLevel: 'concise',
  theme: 'waterColor',
  creatorName: NOTEBOOK.creatorName,
  cover: true,
  referenceLink: '',
  extraNotes: ''
};

export const CONTENT_TEXT = {
  heading: 'Solving one-step equations',
  body: 'An equation stays balanced when both sides change together.',
  item: 'Undo addition with subtraction'
};

/** The notebook content the stubbed API returns. */
export const OUTPUT = {
  direction: 'ltr',
  topicTitle: NOTEBOOK.topicTitle,
  subject: NOTEBOOK.subject,
  content: `## ${CONTENT_TEXT.heading}\n\n${CONTENT_TEXT.body}\n\n- ${CONTENT_TEXT.item}\n- Undo multiplication with division\n`
};

// ─── The PDF stage and the saved project ─────────────────────────────────

export type PdfStatus = 'Pending' | 'Completed' | 'Failed';

/** Where a stubbed finished PDF lives; served from `tests/fixtures/notebook.pdf`. */
export const PDF_URL = 'https://e2e-files.invalid/notebook.pdf';

function ok(data: unknown): JsonValue {
  return { succeeded: true, message: '', statusCode: 200, errorType: null, errors: null, data: data as JsonValue };
}

export function pdfGeneration(status: PdfStatus, errorMessage: string | null = null) {
  return {
    id: 31,
    projectDetailId: PROJECT_DETAIL_ID,
    status,
    pdfUrl: status === 'Completed' ? PDF_URL : null,
    imagesCount: status === 'Completed' ? 4 : null,
    tokensIn: status === 'Completed' ? 1200 : null,
    tokensOut: status === 'Completed' ? 900 : null,
    creditsCharged: status === 'Completed' ? 5 : 0,
    errorMessage,
    createdAt: '2026-10-14T10:00:00Z',
    updatedAt: '2026-10-14T10:01:00Z'
  };
}

export interface NotebookStateOptions {
  /** The PDF the project reports; none unless said otherwise. */
  pdf?: ReturnType<typeof pdfGeneration> | null;
  /** The project cannot be opened: refused with this message. */
  refused?: string;
}

/**
 * Serves the project state My Projects reopens, and that the page reloads
 * after a PDF request fails: `/api/NotebookTool/projects/<id>/state`.
 */
export async function mockNotebookState(browser: Browser, options: NotebookStateOptions = {}): Promise<void> {
  await browser.route('**/api/NotebookTool/projects/*/state**', async (route) => {
    if (options.refused !== undefined) {
      await route.fulfill({
        json: { succeeded: false, message: options.refused, statusCode: 404, errorType: 'Failure', errors: null, data: null }
      });
      return;
    }
    await route.fulfill({
      json: ok({
        toolId: TOOL_ID,
        projectId: PROJECT_ID,
        projectName: 'Saved Notebook',
        projectDetailId: PROJECT_DETAIL_ID,
        inputParametersJson: JSON.stringify(INPUTS),
        outputPayloadJson: JSON.stringify(OUTPUT),
        pdfGeneration: options.pdf ?? null
      })
    });
  });
}

/**
 * Stubs the PDF request (`/api/NotebookTool/<project>/details/<detail>/generate-pdf`),
 * which renders the notebook and charges for it, and serves the PDF it names.
 */
export async function mockNotebookPdf(
  browser: Browser,
  outcome: { status: PdfStatus; errorMessage?: string } | { refused: string; errorType?: string } | { httpStatus: number }
): Promise<{ requests: string[] }> {
  const requests: string[] = [];
  await browser.route('https://e2e-files.invalid/**', async (route) => {
    await route.fulfill({
      path: 'tests/fixtures/notebook.pdf',
      contentType: 'application/pdf',
      headers: { 'access-control-allow-origin': '*' }
    });
  });
  await browser.route('**/api/NotebookTool/*/details/*/generate-pdf', async (route: WebRoute) => {
    requests.push(new URL(route.request.url).pathname);
    if ('httpStatus' in outcome) {
      await route.fulfill({ status: outcome.httpStatus, json: { title: 'Internal Server Error' } });
    } else if ('refused' in outcome) {
      await route.fulfill({
        json: {
          succeeded: false,
          message: outcome.refused,
          statusCode: 400,
          errorType: outcome.errorType ?? 'Failure',
          errors: null,
          data: null
        }
      });
    } else {
      await route.fulfill({ json: ok(pdfGeneration(outcome.status, outcome.errorMessage ?? null)) });
    }
  });
  return { requests };
}

/** The vocabulary of this tool's screens, for the agent; part of the replay cache's key. */
export const NOTEBOOK_CONTEXT = [
  'This is the Notebook Agent in the LRNOVA dashboard: it writes a study notebook, then on request a designed PDF of it.',
  'The page asks its inputs one question at a time, under a "Question n/total" pill and an "answered / total" counter.',
  'A typed answer is confirmed with the Continue button. Choices are buttons whose names start with a letter badge, e.g. "A English".',
  'The first question is the notebook style, chosen in a popup opened with "Choose a style" and kept with the popup\'s own "Choose a style" button.',
  'The last question (Extra notes) has the Generate button; once a notebook exists it reads Regenerate.'
].join(' ');
