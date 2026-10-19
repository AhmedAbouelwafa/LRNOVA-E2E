import { describe, test } from '@e2e-dev/web';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockSavedProject, mockToolApi, mockToolFailure, PROJECT_ID } from '../../helpers/tool-api.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { walkToLastQuestion } from '../../helpers/questionnaire.ts';
import {
  CARD_TEXT,
  DISCUSSION_OUTPUT,
  ENDPOINT,
  fromPicker,
  generateGame,
  MODE,
  NOTES_PLACEHOLDER,
  QUIZ_OUTPUT,
  QUIZ_TEXT,
  ROUTE,
  WALKED_INPUTS
} from './fixture.ts';

/** The set-up view's own Edit and Save (the questions above have Edit buttons too). */
const editItem = (browser: Browser) => browser.locator('.scene-editor .discussion-player__toggle-view-btn');
const saveItem = (browser: Browser) => browser.locator('.scene-editor__save-btn');

/** Beside a game the one Regenerate is the note box's; the questions carry none. */
const notesRegenerate = (browser: Browser) => browser.locator('button.feedback-send-btn');

/** The game is saved as the backend's own shape (`{ game: { levels: [...] } }`). */
type SavedGame = { game: { title: string; levels: { items?: { prompt: string }[]; cards?: { question: string; answer: string }[] }[] } };

describe('gaming agent: generate', { tags: ['tools', 'gaming-agent'], session: 'member', timeout: 300_000 }, () => {
  // ── A quiz ────────────────────────────────────────────────────────────

  test('a generated quiz opens in set-up, with its question and the right answer marked', async ({ app, screen, browser }) => {
    const api = await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
    await generateGame(app, screen, browser, MODE.quiz, QUIZ_TEXT.title);

    await expect(screen.getByText('Set Up Game')).toBeVisible();
    await expect(screen.getByRole('tab', /^Quiz Game/)).toBeVisible();
    await expect(screen.getByText(QUIZ_TEXT.question)).toBeVisible();
    await expect(screen.getByText(QUIZ_TEXT.right)).toBeVisible();
    await expect(screen.getByText(QUIZ_TEXT.wrong)).toBeVisible();
    await expect(screen.getByText('Correct Answer')).toBeVisible();

    expect(api.runs).toHaveLength(1);
    expect(api.runs[0].inputs).toMatchObject(WALKED_INPUTS);
  });

  test('Start Game plays the quiz through to its score', async ({ app, screen, browser }) => {
    await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
    await generateGame(app, screen, browser, MODE.quiz, QUIZ_TEXT.title);

    await screen.getByRole('button', 'Start Game').tap();
    await expect(screen.getByRole('heading', QUIZ_TEXT.question)).toBeVisible();
    await screen.getByRole('button', QUIZ_TEXT.right).tap();
    await expect(screen.getByRole('button', QUIZ_TEXT.right)).toBeDisabled();

    await screen.getByRole('button', /^Next/).tap();
    await expect(screen.getByText('Final Level Complete!')).toBeVisible();
    await expect(screen.getByText('Total Score: 1/1')).toBeVisible();
  });

  test('an edited quiz question is saved to the project', async ({ app, screen, browser }) => {
    const api = await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
    await generateGame(app, screen, browser, MODE.quiz, QUIZ_TEXT.title);
    const text = 'What do you do before you answer?';

    await editItem(browser).tap();
    await browser.locator('.scene-editor__textarea').first().fill(text);
    await saveItem(browser).tap();

    await expect(screen.getByText(text)).toBeVisible();
    await expect(screen.getByText('Updated successfully', { exact: false })).toBeVisible({ timeout: 20_000 });
    expect(api.updates).toHaveLength(1);
    expect(api.updates[0].projectId).toBe(PROJECT_ID);
    expect((api.updates[0].output as SavedGame).game.levels[0].items?.[0].prompt).toBe(text);
  });

  // ── Discussion cards ─────────────────────────────────────────────────

  test('generated discussion cards open in set-up with every card', async ({ app, screen, browser }) => {
    await mockToolApi(browser, ENDPOINT, DISCUSSION_OUTPUT);
    await generateGame(app, screen, browser, MODE.discussion, CARD_TEXT.title);

    await expect(screen.getByRole('tab', /^Discussion Game/)).toBeVisible();
    await expect(screen.getByText(CARD_TEXT.question)).toBeVisible();
    await expect(screen.getByText(CARD_TEXT.answer)).toBeVisible();
    await screen.getByRole('button', /Card 2/).tap();
    await expect(screen.getByText(CARD_TEXT.question2)).toBeVisible();
  });

  test('an edited card is saved to the project', async ({ app, screen, browser }) => {
    const api = await mockToolApi(browser, ENDPOINT, DISCUSSION_OUTPUT);
    await generateGame(app, screen, browser, MODE.discussion, CARD_TEXT.title);

    await editItem(browser).tap();
    await browser.locator('.scene-editor__textarea').first().fill('Who listened to you best this week?');
    await saveItem(browser).tap();

    await expect(screen.getByText('Who listened to you best this week?')).toBeVisible();
    await expect.poll(() => api.updates.length, { timeout: 20_000 }).toBe(1);
    const cards = (api.updates[0].output as SavedGame).game.levels[0].cards ?? [];
    expect(cards[0]).toMatchObject({ question: 'Who listened to you best this week?', answer: CARD_TEXT.answer });
  });

  // ── Running it again ─────────────────────────────────────────────────

  test('the note box regenerates the game with the note', async ({ app, screen, browser }) => {
    const api = await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
    await generateGame(app, screen, browser, MODE.quiz, QUIZ_TEXT.title);

    await screen.getByPlaceholder(NOTES_PLACEHOLDER).fill('Make it harder');
    await notesRegenerate(browser).tap();

    await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
    expect(api.runs[1].inputs).toMatchObject({ ...WALKED_INPUTS, notes: 'Make it harder' });
  });

  // Two Regenerate buttons sat beside the game — the questions' last one and
  // the note box's — doing the same thing. The note box's is the one kept.
  test('beside the game there is one Regenerate, and it runs the same answers again', async ({ app, screen, browser }) => {
    const api = await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
    await generateGame(app, screen, browser, MODE.quiz, QUIZ_TEXT.title);

    // The questions still open on their last one
    await expect(screen.getByText('Question 12/12')).toBeVisible();
    await expect(screen.getByRole('button', 'Regenerate')).toHaveCount(1);
    await expect(browser.locator('button.q-generate-btn')).toHaveCount(0);

    await notesRegenerate(browser).tap();
    await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
    expect(api.runs[1].inputs).toMatchObject(WALKED_INPUTS);
  });

  test('switching the site to Arabic keeps the game and the answers a regenerate sends', async ({ app, screen, browser }) => {
    const api = await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
    await generateGame(app, screen, browser, MODE.quiz, QUIZ_TEXT.title);

    await switchToArabic(screen);
    await expect(screen.getByRole('heading', 'منشئ الألعاب التعليمية')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(QUIZ_TEXT.question)).toBeVisible();

    await notesRegenerate(browser).tap();
    await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(2);
    expect(api.runs[1].inputs).toMatchObject(WALKED_INPUTS);
  });

  // ── The rest of the canvas ───────────────────────────────────────────

  test('renaming the project saves the new title', async ({ app, screen, browser }) => {
    const api = await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
    await generateGame(app, screen, browser, MODE.quiz, QUIZ_TEXT.title);
    const title = 'Untitled - Gaming Agent';

    await screen.getByText(title).tap();
    await screen.getByDisplayValue(title).fill('Listening Game');
    await screen.getByDisplayValue('Listening Game').press('Enter');

    await expect(screen.getByText('Listening Game')).toBeVisible();
    expect(api.renames).toEqual([{ projectId: PROJECT_ID, name: 'Listening Game' }]);
  });

  test('Copy all content confirms the copy', async ({ app, screen, browser }) => {
    await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
    await generateGame(app, screen, browser, MODE.quiz, QUIZ_TEXT.title);

    await browser.locator('button.tool-copy-button').tap();
    await expect(screen.getByText('✓ Content copied to clipboard!')).toBeVisible();
  });

  test('running out of credits offers an upgrade', async ({ app, screen, browser }) => {
    await mockToolFailure(browser, ENDPOINT, { message: 'Not enough credits.', errorType: 'InsufficientCredits' });
    await fromPicker(app, screen, browser, MODE.quiz);
    await walkToLastQuestion(screen, browser);
    await screen.getByRole('button', 'Generate').tap();

    const dialog = screen.getByRole('dialog');
    await expect(dialog.getByText('Insufficient Credits')).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', 'Maybe Later').tap();
    await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
  });

  // ── A project opened from My Projects ──────────────────────────────────

  test('a saved game opens in set-up, with its answers and Regenerate in reach', async ({ app, screen, browser }) => {
    await mockSavedProject(browser, PROJECT_ID, QUIZ_OUTPUT, { ...WALKED_INPUTS, topic: 'Active Listening' });
    await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);

    await app.open(`${ROUTE}?projectId=${PROJECT_ID}&projectName=Saved%20Game`);
    await expect(screen.getByText('Saved Game')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(QUIZ_TEXT.question)).toBeVisible();
    await expect(screen.getByText('Active Listening')).toBeVisible();
    await expect(notesRegenerate(browser)).toBeVisible();
  });
});
