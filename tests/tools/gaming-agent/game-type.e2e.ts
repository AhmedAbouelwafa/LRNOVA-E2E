import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockToolApi } from '../../helpers/tool-api.ts';
import { walkToLastQuestion } from '../../helpers/questionnaire.ts';
import { DISCUSSION_OUTPUT, ENDPOINT, fromPicker, MODE, PICKER, QUIZ_OUTPUT, ROUTE } from './fixture.ts';

/**
 * The Gaming Agent's game type.
 *
 * The game picker asks it and hands it over in the navigation state, so the
 * questionnaire does not ask it again — unless there was no picker: opened from
 * a link, the page asks Game Type itself. Either way the form, which requires
 * it, can generate.
 */
describe('gaming agent: game type', { tags: ['tools', 'gaming-agent'], session: 'member', timeout: 180_000 }, () => {
  test('the picker offers two games now and shows the rest as coming soon', async ({ app, screen, browser }) => {
    await app.open(PICKER);

    await expect(screen.getByText('What is the goal of your game?')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(MODE.quiz)).toBeVisible();
    await expect(screen.getByText(MODE.discussion)).toBeVisible();
    // The other four are on show, marked, and take no clicks
    await expect(browser.locator('.game-card.is-disabled')).toHaveCount(4);
    await expect(screen.getByText('Sort cards into the correct categories.')).toBeVisible();
    await expect(browser.locator('.game-card.is-disabled .game-card__coming-soon')).toHaveCount(4);
  });

  test('entered from the game picker, the questions generate a quiz', async ({ app, screen, browser }) => {
    const api = await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
    await fromPicker(app, screen, browser, MODE.quiz);

    await walkToLastQuestion(screen, browser);
    // The picker already answered it
    await expect(screen.getByText('Game Type')).toHaveCount(0);
    await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    await screen.getByRole('button', 'Generate').tap();

    await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(1);
    expect(api.runs[0].inputs).toMatchObject({ gameType: 'quiz' });
  });

  test('a class discussion from the picker generates discussion cards', async ({ app, screen, browser }) => {
    const api = await mockToolApi(browser, ENDPOINT, DISCUSSION_OUTPUT);
    await fromPicker(app, screen, browser, MODE.discussion);

    await walkToLastQuestion(screen, browser);
    await screen.getByRole('button', 'Generate').tap();

    await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(1);
    expect(api.runs[0].inputs).toMatchObject({ gameType: 'discussion_cards' });
  });

  // The game type used to be cleared with the rest of the form, and nothing
  // asked for it again — the next game could not be generated until a reload.
  test('New Project keeps the game type, so the next game can generate', async ({ app, screen, browser }) => {
    await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
    await fromPicker(app, screen, browser, MODE.quiz);
    await walkToLastQuestion(screen, browser);
    await screen.getByRole('button', 'Generate').tap();
    await expect(screen.getByRole('button', 'New Project')).toBeVisible({ timeout: 20_000 });

    await screen.getByRole('button', 'New Project').tap();
    await walkToLastQuestion(screen, browser);
    await expect(screen.getByText('Ready to generate')).toBeVisible();
    await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
  });

  // Opened from a link rather than the picker (a bookmark, a shared URL, a new
  // tab) there is no game type to hand over, so the page asks it. It used to say
  // "Ready to generate" with Generate disabled and no reason given.
  test('opened from a direct link, the page asks the game type and can generate', async ({ app, screen, browser }) => {
    const api = await mockToolApi(browser, ENDPOINT, QUIZ_OUTPUT);
    await app.open(ROUTE);
    await expect(browser.locator('.q-progress__label')).toBeVisible({ timeout: 20_000 });

    await walkToLastQuestion(screen, browser);
    await expect(screen.getByText('Game Type')).toBeVisible();
    await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    await screen.getByRole('button', 'Generate').tap();

    await expect.poll(() => api.runs.length, { timeout: 20_000 }).toBe(1);
    expect(api.runs[0].inputs).toMatchObject({ gameType: 'quiz' });
  });
});
