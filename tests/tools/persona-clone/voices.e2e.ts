import { describe, test } from '@e2e-dev/web';
import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  BUTTON,
  clones,
  FILES,
  mockPersonaClone,
  PLACEHOLDER,
  ROUTE,
  SUBTAB,
  TAB,
  TEXT,
  uploadedUrl,
  type PersonaCloneOptions
} from './fixture.ts';

const banner = (browser: Browser) => browser.locator('.cc-banner');
const createButton = (screen: Screen) => screen.getByRole('button', new RegExp(BUTTON.voice));
const nameBox = (screen: Screen) => screen.getByPlaceholder(PLACEHOLDER.voiceName);
const libraryTab = (screen: Screen) => screen.getByRole('tab', new RegExp(SUBTAB.voiceLibrary));

/** Opens the page on its My Voices tab. */
async function openVoices(app: App, screen: Screen, browser: Browser, options: PersonaCloneOptions = {}) {
  const api = await mockPersonaClone(browser, options);
  await app.open(ROUTE);
  await screen.getByRole('tab', TAB.voices).tap();
  await expect(nameBox(screen)).toBeVisible({ timeout: 20_000 });
  return api;
}

async function pickSample(browser: Browser, file = FILES.voice) {
  await browser.locator('input[type="file"]').setInputFiles([file]);
}

describe('clone yourself: voices', { tags: ['tools', 'persona-clone'], session: 'member', timeout: 180_000 }, () => {
  test('My Voices opens on its create form, under the plan\'s voice capacity', async ({ app, screen, browser }) => {
    await openVoices(app, screen, browser, { voices: clones(2, 'Voice') });

    await expect(screen.getByRole('tab', TAB.voices)).toHaveAttribute('aria-selected', 'true');
    await expect(screen.getByRole('tab', SUBTAB.createVoice)).toHaveAttribute('aria-selected', 'true');
    await expect(banner(browser)).toContainText('Voice cloning');
    await expect(banner(browser)).toContainText('2 of 3 voice clones in use');
    await expect(banner(browser)).toContainText('1 remaining');
    await expect(screen.getByText('Drop a recording, or click to browse')).toBeVisible();
    await expect(createButton(screen)).toBeDisabled();
  });

  test('a sample uploads, can be played back, and the voice lands in the library still processing', async ({ app, screen, browser }) => {
    const api = await openVoices(app, screen, browser);

    await pickSample(browser);
    await expect(screen.getByText('narration.wav')).toBeVisible();
    await expect(browser.locator('audio.pc-take__player')).toBeVisible({ timeout: 20_000 });
    await expect(nameBox(screen)).toHaveValue('narration');
    expect(api.uploads).toEqual([{ mediaKind: 'voice', fileName: 'narration.wav' }]);

    await createButton(screen).tap();
    await expect.poll(() => api.creates.length, { timeout: 20_000 }).toBe(1);
    expect(api.creates[0]).toEqual({ kind: 'voices', name: 'narration', sourceUrl: uploadedUrl('voice', 'narration.wav') });
    await expect(nameBox(screen)).toHaveValue('');
    await expect(banner(browser)).toContainText('1 of 3 voice clones in use');

    // A voice is cloned in the background: listed as processing, with nothing to play yet
    await libraryTab(screen).tap();
    await expect(screen.getByText('narration', { exact: true })).toBeVisible();
    await expect(screen.getByText('Processing…')).toBeVisible();
    await expect(browser.locator('audio.pc-item__player')).toHaveCount(0);
  });

  test('a file that is not audio is refused, with the reason', async ({ app, screen, browser }) => {
    const api = await openVoices(app, screen, browser);

    await pickSample(browser, FILES.notMedia);
    await expect(screen.getByText(TEXT.notAudio)).toBeVisible({ timeout: 20_000 });
    await expect(createButton(screen)).toBeDisabled();
    expect(api.uploads).toHaveLength(0);
  });

  test('a picked sample can be taken back', async ({ app, screen, browser }) => {
    await openVoices(app, screen, browser);
    await pickSample(browser);
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });

    await browser.locator('button.pc-take__x').tap();
    await expect(screen.getByText('Drop a recording, or click to browse')).toBeVisible();
    await expect(createButton(screen)).toBeDisabled();
  });

  test('an upload that fails says so', async ({ app, screen, browser }) => {
    await openVoices(app, screen, browser, { uploadFails: true });

    await pickSample(browser);
    await expect(screen.getByText(TEXT.uploadFailed)).toBeVisible({ timeout: 20_000 });
    await expect(createButton(screen)).toBeDisabled();
  });

  test('a refused voice says it was not saved, and keeps the sample and name', async ({ app, screen, browser }) => {
    await openVoices(app, screen, browser, { create: { refused: 'The sample is too short.' } });
    await pickSample(browser);
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });

    await createButton(screen).tap();
    await expect(screen.getByText(TEXT.saveFailed)).toBeVisible({ timeout: 20_000 });
    await expect(nameBox(screen)).toHaveValue('narration');
  });

  test('a voice over the plan\'s limit, refused by the server, offers the upgrade', async ({ app, screen, browser }) => {
    await openVoices(app, screen, browser, { create: { refused: 'Plan limit reached.', errorType: 'PlanLimitExceeded' } });
    await pickSample(browser);
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });

    await createButton(screen).tap();
    await expect(screen.getByRole('dialog').getByText('Upgrade Required')).toBeVisible({ timeout: 20_000 });
  });

  test('a ready voice in the library can be played', async ({ app, screen, browser }) => {
    await openVoices(app, screen, browser, {
      voices: [
        { id: 1, name: 'Studio Voice', sourceUrl: 'https://e2e-uploads.invalid/v1-source', previewUrl: 'https://e2e-uploads.invalid/v1-preview', status: 'Completed' },
        { id: 2, name: 'Broken Voice', sourceUrl: 'https://e2e-uploads.invalid/v2', status: 'Failed' }
      ]
    });

    await libraryTab(screen).tap();
    await expect(screen.getByText('Studio Voice')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('Ready')).toBeVisible();
    await expect(screen.getByText('Failed')).toBeVisible();
    // Only the ready one plays, and it plays its preview
    await expect(browser.locator('audio.pc-item__player')).toHaveCount(1);
    await expect(browser.locator('audio.pc-item__player')).toHaveAttribute('src', 'https://e2e-uploads.invalid/v1-preview');
  });

  test('the library pages five at a time', async ({ app, screen, browser }) => {
    await openVoices(app, screen, browser, { voices: clones(6, 'Voice'), voiceCapacity: { limit: 20 } });

    await libraryTab(screen).tap();
    await expect(screen.getByText('Showing 1–5 of 6')).toBeVisible({ timeout: 20_000 });
    await screen.getByRole('button', 'Next page').tap();
    await expect(screen.getByText('Voice 6')).toBeVisible();
  });

  test('an empty library says how to fill it', async ({ app, screen, browser }) => {
    await openVoices(app, screen, browser);

    await libraryTab(screen).tap();
    await expect(screen.getByText(TEXT.voiceEmpty)).toBeVisible({ timeout: 20_000 });
  });

  test('deleting a voice removes it and frees its slot', async ({ app, screen, browser }) => {
    const api = await openVoices(app, screen, browser, { voices: clones(2, 'Voice') });
    await libraryTab(screen).tap();
    await expect(screen.getByText('Voice 1', { exact: true })).toBeVisible({ timeout: 20_000 });

    await browser.locator('button.pc-item__del').first().tap();
    if ((await screen.getByRole('dialog').count()) > 0) {
      await screen.getByRole('dialog').getByRole('button', /Delete|Confirm|Yes/).tap();
    }

    await expect.poll(() => api.deletes.length, { timeout: 20_000 }).toBe(1);
    expect(api.deletes[0]).toEqual({ kind: 'voices', id: 500 });
    await expect(screen.getByText('Voice 1', { exact: true })).toHaveCount(0);
    await expect(banner(browser)).toContainText('1 of 3 voice clones in use');
  });

  test('at the plan\'s voice limit the voice form closes, while avatars stay open', async ({ app, screen, browser }) => {
    await openVoices(app, screen, browser, { voices: clones(2, 'Voice'), voiceCapacity: { limit: 2 } });

    await expect(banner(browser)).toContainText('Limit reached', { timeout: 20_000 });
    await expect(banner(browser)).toContainText("You've reached your plan's voice cloning limit.");
    await expect(nameBox(screen)).toBeDisabled();

    // Each kind has its own capacity
    await screen.getByRole('tab', TAB.avatars).tap();
    await expect(banner(browser)).toContainText('Available');
    await expect(screen.getByPlaceholder(PLACEHOLDER.avatarName)).toBeEnabled();
  });
});
