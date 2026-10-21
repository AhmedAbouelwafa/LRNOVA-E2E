import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockToolApi, mockToolFailure, mockToolHttpFailure, PROJECT_DETAIL_ID, PROJECT_ID, type MockOptions } from '../../helpers/tool-api.ts';
import { progress } from '../../helpers/questionnaire.ts';
import { switchToArabic } from '../../helpers/language.ts';
import {
  answerIntake,
  CHOOSE_STYLE,
  CONTENT_TEXT,
  ENDPOINT,
  INPUTS,
  mockNotebookPdf,
  mockNotebookState,
  NOTEBOOK,
  OUTPUT,
  pdfGeneration,
  ROUTE,
  TOOL_ID,
  TOTAL
} from './fixture.ts';

const TAB = { content: /^Content/, pdf: /^Notebook PDF/ };

/** Answers every question and generates the content against the stubbed API. */
async function generate(app: App, screen: Screen, browser: Browser, options?: MockOptions) {
  const api = await mockToolApi(browser, ENDPOINT, OUTPUT, options);
  await app.open(ROUTE);
  await answerIntake(screen);
  await screen.getByRole('button', 'Generate').tap();
  if (!options?.hold) {
    await expect(screen.getByRole('heading', CONTENT_TEXT.heading)).toBeVisible({ timeout: 20_000 });
  }
  return api;
}

/** The content's own Edit, not the questions' Edit buttons. */
const editContent = (browser: Browser) => browser.locator('button.notebook-toolbar-button');
const editor = (browser: Browser) => browser.locator('.ql-editor');

/** Answers every question and presses Generate against a refusal already stubbed. */
async function generateRefused(app: App, screen: Screen) {
  await app.open(ROUTE);
  await answerIntake(screen);
  await screen.getByRole('button', 'Generate').tap();
}

describe('notebook agent: generate', { tags: ['tools', 'notebook-agent'], session: 'member', timeout: 300_000 }, () => {
  // ── The content ───────────────────────────────────────────────────────

  test('Generate writes the notebook from the answers, and the URL takes its project', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser);

    await expect(screen.getByText(CONTENT_TEXT.body)).toBeVisible();
    await expect(screen.getByRole('listitem').filter({ hasText: CONTENT_TEXT.item })).toBeVisible();
    await expect(screen.getByRole('tab', TAB.content)).toBeVisible();
    await expect(screen.getByRole('button', 'Generate Notebook PDF')).toBeVisible();
    await expect(browser).toHaveURL(`${ROUTE}?projectId=${PROJECT_ID}`);

    expect(api.runs).toHaveLength(1);
    expect(api.runs[0].toolId).toBe(TOOL_ID);
    expect(api.runs[0].projectId).toBeNull();
    expect(api.runs[0].inputs).toEqual(INPUTS);
  });

  test('the content is written behind a loader', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser, { hold: true });

    await expect(screen.getByText('Generating notebook content…')).toBeVisible({ timeout: 10_000 });
    api.release();
    await expect(screen.getByRole('heading', CONTENT_TEXT.heading)).toBeVisible({ timeout: 20_000 });
  });

  test('beside the notebook the inputs open on Regenerate, which reruns the same project', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser);

    await expect(screen.getByRole('button', 'Regenerate')).toBeVisible();
    await expect(progress(screen, TOTAL - 1, TOTAL)).toBeVisible();
    await screen.getByRole('button', 'Regenerate').tap();

    await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
    expect(api.runs[1].projectId).toBe(PROJECT_ID);
    expect(api.runs[1].inputs).toEqual(INPUTS);
  });

  // The editor's HTML carries non-breaking spaces; the other tools clean them
  // before turning it back into markdown, this one saves them as they are —
  // and text joined by them never wraps where a space would.
  test('an edit to the content is saved as markdown', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser);
    const text = 'Balance both sides, always.';

    await editContent(browser).tap();
    await expect(editor(browser)).toContainText(CONTENT_TEXT.body);
    await editor(browser).fill(text);
    await screen.getByRole('button', 'Save').tap();

    await expect(screen.getByText(text)).toBeVisible({ timeout: 20_000 });
    expect(api.updates).toHaveLength(1);
    expect(api.updates[0]).toMatchObject({ projectId: PROJECT_ID, projectDetailId: PROJECT_DETAIL_ID });
    const saved = String(api.updates[0].output.content);
    expect(saved.replace(/ /g, ' ')).toContain(text);
    expect(saved).not.toMatch(/ /);
    // The rest of the notebook's fields go back with the edit
    expect(api.updates[0].output).toMatchObject({ direction: 'ltr', topicTitle: NOTEBOOK.topicTitle });
  });

  test('cancelling an edit keeps the content as it was', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser);

    await editContent(browser).tap();
    await editor(browser).fill('A draft nobody saved.');
    await screen.getByRole('button', 'Cancel').tap();

    await expect(screen.getByText(CONTENT_TEXT.body)).toBeVisible();
    await expect(screen.getByText('A draft nobody saved.')).toHaveCount(0);
    expect(api.updates).toHaveLength(0);
  });

  test('New Project returns to a blank first question', async ({ app, screen, browser }) => {
    await generate(app, screen, browser);

    await screen.getByRole('button', 'New Project').tap();
    await expect(screen.getByText('Question 1/11')).toBeVisible();
    await expect(progress(screen, 0, TOTAL)).toBeVisible();
    await expect(screen.getByRole('button', CHOOSE_STYLE)).toBeVisible();
    await expect(browser).toHaveURL(ROUTE);
  });

  test('switching the site to Arabic keeps the notebook and the inputs a regenerate sends', async ({ app, screen, browser }) => {
    const api = await generate(app, screen, browser);

    await switchToArabic(screen);
    await expect(screen.getByRole('button', 'إعادة الإنشاء')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByRole('heading', CONTENT_TEXT.heading)).toBeVisible();

    await screen.getByRole('button', 'إعادة الإنشاء').tap();
    await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
    expect(api.runs[1].inputs).toEqual(INPUTS);
  });

  // ── When the content cannot be written ────────────────────────────────

  test('a refused notebook says why and keeps the answers', async ({ app, screen, browser }) => {
    await mockToolFailure(browser, ENDPOINT, { message: 'The model is busy, try again.' });
    await generateRefused(app, screen);

    await expect(screen.getByRole('alert')).toContainText('The model is busy, try again.', { timeout: 20_000 });
    await expect(screen.getByText(NOTEBOOK.topicTitle)).toBeVisible();
    await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
  });

  // The refusal's message is thrown as the error text, so a refusal that comes
  // with none leaves an empty error: nothing at all is shown.
  test('a refusal with no message still says the notebook was not made', async ({ app, screen, browser }) => {
    await mockToolFailure(browser, ENDPOINT, { message: '' });
    await generateRefused(app, screen);

    await expect(screen.getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
  });

  // An HTTP failure shows the browser's own wording, address and all.
  test('a server error is told in plain words', async ({ app, screen, browser }) => {
    await mockToolHttpFailure(browser, ENDPOINT);
    await generateRefused(app, screen);

    await expect(screen.getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(/Http failure/)).toHaveCount(0);
    await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
  });

  // Every other tool offers the upgrade; this one prints the refusal's text.
  test('running out of credits offers an upgrade', async ({ app, screen, browser }) => {
    await mockToolFailure(browser, ENDPOINT, { message: 'Not enough credits.', errorType: 'InsufficientCredits' });
    await generateRefused(app, screen);

    const dialog = screen.getByRole('dialog');
    await expect(dialog.getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', 'Maybe Later').tap();
    await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
  });

  // ── The PDF ───────────────────────────────────────────────────────────

  test('Generate Notebook PDF opens the finished PDF, and the content becomes final', async ({ app, screen, browser }) => {
    await generate(app, screen, browser);
    const pdf = await mockNotebookPdf(browser, { status: 'Completed' });

    await screen.getByRole('button', 'Generate Notebook PDF').tap();

    await expect(screen.getByRole('tab', TAB.pdf)).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
    await expect(screen.getByText('1 / 2')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByRole('button', 'Download')).toBeVisible();
    expect(pdf.requests).toEqual([`/api/NotebookTool/${PROJECT_ID}/details/${PROJECT_DETAIL_ID}/generate-pdf`]);

    // The PDF is of this content, so the content can no longer change
    await screen.getByRole('tab', TAB.content).tap();
    await expect(screen.getByText('This notebook version is final and read-only.')).toBeVisible();
    await expect(editContent(browser)).toHaveCount(0);
    await expect(screen.getByRole('button', 'Generate Notebook PDF')).toHaveCount(0);
  });

  test('the PDF pages and downloads', async ({ app, screen, browser }) => {
    await generate(app, screen, browser);
    await mockNotebookPdf(browser, { status: 'Completed' });
    await screen.getByRole('button', 'Generate Notebook PDF').tap();
    await expect(screen.getByText('1 / 2')).toBeVisible({ timeout: 20_000 });

    await screen.getByRole('button', 'Next page').tap();
    await expect(screen.getByText('2 / 2')).toBeVisible();
    await expect(screen.getByRole('button', 'Next page')).toBeDisabled();

    const download = await browser.waitForDownload(() => screen.getByRole('button', 'Download').tap());
    expect(download.suggestedFilename).toBe('notebook.pdf');
  });

  test('a PDF still rendering holds the tab on its loader and locks the content', async ({ app, screen, browser }) => {
    await generate(app, screen, browser);
    await mockNotebookPdf(browser, { status: 'Pending' });

    await screen.getByRole('button', 'Generate Notebook PDF').tap();
    await expect(screen.getByRole('button', 'Refresh status')).toBeVisible({ timeout: 20_000 });

    await screen.getByRole('tab', TAB.content).tap();
    await expect(screen.getByText('Content is read-only while PDF generation is pending.')).toBeVisible();
    await expect(editContent(browser)).toHaveCount(0);
  });

  test('a failed PDF says why and offers a retry', async ({ app, screen, browser }) => {
    await generate(app, screen, browser);
    await mockNotebookPdf(browser, { status: 'Failed', errorMessage: 'The cover image could not be drawn.' });

    await screen.getByRole('button', 'Generate Notebook PDF').tap();
    await expect(screen.getByText('The cover image could not be drawn.')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByRole('button', 'Retry PDF')).toBeVisible();
  });

  // Every other paid run offers the upgrade; the PDF prints the refusal's text.
  test('a PDF the plan cannot pay for offers an upgrade', async ({ app, screen, browser }) => {
    await generate(app, screen, browser);
    await mockNotebookState(browser);
    await mockNotebookPdf(browser, { refused: 'Not enough credits.', errorType: 'InsufficientCredits' });

    await screen.getByRole('button', 'Generate Notebook PDF').tap();
    const dialog = screen.getByRole('dialog');
    await expect(dialog.getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
  });

  test('a PDF the server fails to start is told in plain words, and the content stays editable', async ({ app, screen, browser }) => {
    await generate(app, screen, browser);
    await mockNotebookState(browser); // what the page reloads after the failure: no PDF
    await mockNotebookPdf(browser, { httpStatus: 500 });

    await screen.getByRole('button', 'Generate Notebook PDF').tap();
    await expect(screen.getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(/Http failure/)).toHaveCount(0);

    await screen.getByRole('tab', TAB.content).tap();
    await expect(editContent(browser)).toBeVisible();
  });

  // ── A project opened from My Projects ──────────────────────────────────

  test('a saved notebook opens with its content, its answers and Regenerate', async ({ app, screen, browser }) => {
    await mockNotebookState(browser);
    await mockToolApi(browser, ENDPOINT, OUTPUT);
    await app.open(`${ROUTE}?projectId=${PROJECT_ID}&projectDetailId=${PROJECT_DETAIL_ID}`);

    await expect(screen.getByRole('heading', CONTENT_TEXT.heading)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('Saved Notebook')).toBeVisible();
    await expect(screen.getByText(NOTEBOOK.topicTitle)).toBeVisible();
    await expect(screen.getByRole('button', 'Regenerate')).toBeVisible();
  });

  test('a saved notebook with a finished PDF opens on the PDF', async ({ app, screen, browser }) => {
    await mockNotebookState(browser, { pdf: pdfGeneration('Completed') });
    await mockNotebookPdf(browser, { status: 'Completed' });
    await app.open(`${ROUTE}?projectId=${PROJECT_ID}&projectDetailId=${PROJECT_DETAIL_ID}`);

    await expect(screen.getByRole('tab', TAB.pdf)).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
    await expect(screen.getByText('1 / 2')).toBeVisible({ timeout: 20_000 });
  });

  test('a notebook that cannot be opened says so', async ({ app, screen, browser }) => {
    await mockNotebookState(browser, { refused: 'This project no longer exists.' });
    await app.open(`${ROUTE}?projectId=${PROJECT_ID}`);

    await expect(screen.getByRole('alert')).toContainText('This project no longer exists.', { timeout: 20_000 });
    await expect(screen.getByRole('button', CHOOSE_STYLE)).toBeVisible();
  });
});
