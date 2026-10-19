import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockUpload, UPLOADED_FILE_URL } from '../../helpers/tool-api.ts';
import { mockTextVideoApi } from '../../helpers/text-video-api.ts';
import { answerAll, progress } from '../../helpers/questionnaire.ts';
import { switchToArabic } from '../../helpers/language.ts';
import { expectCacheOutcome } from '../../helpers/agent.ts';
import { ANSWERS, PLACEHOLDER, ROUTE, STORYBOARD, TAB, TEXT_TO_VIDEO_CONTEXT, TOOL_NAME, TOOL_NAME_AR, TOTAL, VIDEO } from './fixture.ts';

describe('text to video: intake', { tags: ['tools', 'text-to-video-generator'], session: 'member', timeout: 180_000 }, () => {
  test('opens on the video idea, one of ten questions', async ({ app, screen, browser }) => {
    await mockTextVideoApi(browser, { storyboard: STORYBOARD });
    await app.open(ROUTE);

    await expect(screen.getByRole('heading', TOOL_NAME)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('Video Idea')).toBeVisible();
    await expect(progress(screen, 0, TOTAL)).toBeVisible();
    await expect(screen.getByRole('button', 'Continue')).toBeDisabled();
    // Nothing to show yet, so no canvas
    await expect(screen.getByRole('tab', TAB.storyboard)).toHaveCount(0);
  });

  test('a video idea needs twenty characters', async ({ app, screen, browser }) => {
    await mockTextVideoApi(browser, { storyboard: STORYBOARD });
    await app.open(ROUTE);

    const idea = screen.getByPlaceholder(PLACEHOLDER.prompt);
    await idea.fill('Too short');
    await idea.press('Tab');
    await expect(screen.getByText('Video Idea must be at least 20 characters')).toBeVisible();
    await expect(screen.getByRole('button', 'Continue')).toBeDisabled();

    await idea.fill(VIDEO.prompt);
    await expect(screen.getByRole('button', 'Continue')).toBeEnabled();
    await expect(screen.getByText(`${VIDEO.prompt.length}/200`)).toBeVisible();
  });

  test('every answer moves the counter, and the last question carries Generate', async ({ app, screen, browser }) => {
    const api = await mockTextVideoApi(browser, { storyboard: STORYBOARD });
    await app.open(ROUTE);

    await answerAll(screen, ANSWERS, TOTAL);
    await expect(screen.getByText('Notes')).toBeVisible();
    await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    // The answers so far, as they collapsed
    await expect(screen.getByText(VIDEO.prompt)).toBeVisible();
    await expect(screen.getByText('20 – 30')).toBeVisible();
    await expect(screen.getByText('Intermediate')).toBeVisible();
    await expect(screen.getByText('Portrait')).toBeVisible();
    await expect(screen.getByText('3 min')).toBeVisible();
    expect(api.storyboards).toHaveLength(0);
  });

  test('the style picker changes the style, and a style that is not ready cannot be picked', async ({ app, screen, browser }) => {
    await mockTextVideoApi(browser, { storyboard: STORYBOARD });
    await app.open(ROUTE);
    await answerAll(screen, ANSWERS.slice(0, 4), TOTAL);

    await expect(browser.locator('.ttv-picker__value')).toHaveText('Realistic');
    await browser.locator('.ttv-picker').tap();
    const dialog = screen.getByRole('dialog');
    await expect(dialog.getByRole('heading', 'Choose a video style')).toBeVisible();
    await expect(browser.locator('.sp-card.is-disabled')).toBeDisabled();
    await expect(dialog.getByText('InActive')).toBeVisible();

    // Cancel keeps the style it had (the footer's: the header's × is named Cancel too)
    await dialog.getByRole('button', /Whiteboard/).tap();
    await browser.locator('.sp-btn--ghost').tap();
    await expect(browser.locator('.ttv-picker__value')).toHaveText('Realistic');

    await browser.locator('.ttv-picker').tap();
    await screen.getByRole('dialog').getByRole('button', /Whiteboard/).tap();
    await screen.getByRole('dialog').getByRole('button', 'Confirm').tap();
    await expect(screen.getByRole('dialog')).toHaveCount(0);
    await expect(browser.locator('.ttv-picker__value')).toHaveText('Whiteboard');
  });

  test('the voice picker changes the narrating voice', async ({ app, screen, browser }) => {
    await mockTextVideoApi(browser, { storyboard: STORYBOARD });
    await app.open(ROUTE);
    await answerAll(screen, ANSWERS.slice(0, 5), TOTAL);

    const voice = browser.locator('.ttv-picker__value');
    const before = ((await voice.textContent()) ?? '').trim();
    expect(before).not.toBe('');

    await browser.locator('.ttv-picker').tap();
    await expect(screen.getByRole('dialog').getByText('Voice')).toBeVisible();
    await browser.locator('.vp-voice-card:not(.is-selected)').first().tap();
    await screen.getByRole('dialog').getByRole('button', 'Confirm').tap();

    await expect(screen.getByRole('dialog')).toHaveCount(0);
    await expect(voice).not.toHaveText(before);
  });

  test('a reference file is uploaded, and the run is made with it', async ({ app, screen, browser }) => {
    await mockUpload(browser);
    const api = await mockTextVideoApi(browser, { storyboard: STORYBOARD });
    await app.open(ROUTE);
    await answerAll(screen, ANSWERS.slice(0, -1), TOTAL);

    await browser.locator('input[type="file"]').setInputFiles(['tests/fixtures/reference.txt']);
    await expect(screen.getByText('Uploaded successfully', { exact: false })).toBeVisible({ timeout: 20_000 });
    await screen.getByRole('button', 'Continue').tap();
    await expect(progress(screen, ANSWERS.length, TOTAL)).toBeVisible();
    await expect(screen.getByText('reference.txt')).toBeVisible();

    await screen.getByRole('button', 'Generate').tap();
    await expect.poll(() => api.storyboards.length, { timeout: 20_000 }).toBe(1);
    expect(api.storyboards[0]).toMatchObject({ referenceLink: UPLOADED_FILE_URL });
  });

  test('switching the site to Arabic keeps the answers given', async ({ app, screen, browser }) => {
    await mockTextVideoApi(browser, { storyboard: STORYBOARD });
    await app.open(ROUTE);
    await answerAll(screen, ANSWERS.slice(0, 4), TOTAL);

    await switchToArabic(screen);
    await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
    await expect(progress(screen, 4, TOTAL)).toBeVisible();
    await expect(screen.getByText(VIDEO.prompt)).toBeVisible();
    await expect(screen.getByText(VIDEO.audience)).toBeVisible();
    await expect(screen.getByText('متوسط')).toBeVisible(); // Intermediate
  });

  test(
    'the agent types the video idea and moves on',
    { tags: ['agent'], agentContext: TEXT_TO_VIDEO_CONTEXT },
    async ({ app, screen, browser, agent }) => {
      await mockTextVideoApi(browser, { storyboard: STORYBOARD });
      await app.open(ROUTE);

      expectCacheOutcome(await agent.act('type {idea} as the video idea, then press Continue', { params: { idea: VIDEO.prompt } }));
      await expect(progress(screen, 1, TOTAL)).toBeVisible();
      await expect(screen.getByText(VIDEO.prompt)).toBeVisible();
    }
  );
});
