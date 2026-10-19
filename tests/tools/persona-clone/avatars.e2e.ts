import { describe, test } from '@e2e-dev/web';
import type { Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { switchToArabic } from '../../helpers/language.ts';
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
  TOOL_NAME,
  TOOL_NAME_AR,
  uploadedUrl
} from './fixture.ts';

const banner = (browser: Browser) => browser.locator('.cc-banner');
const createButton = (screen: Screen) => screen.getByRole('button', new RegExp(BUTTON.avatar));
const nameBox = (screen: Screen) => screen.getByPlaceholder(PLACEHOLDER.avatarName);

/** Picks the photo through the drop zone's file input. */
async function pickPhoto(browser: Browser, file = FILES.photo) {
  await browser.locator('input[type="file"]').setInputFiles([file]);
}

/**
 * Deletes the clone at `index` in the library — confirming first, should the
 * page ask (it does not today; see the test that says it should).
 */
async function deleteClone(screen: Screen, browser: Browser, index = 0) {
  await browser.locator('button.pc-item__del').nth(index).tap();
  if ((await screen.getByRole('dialog').count()) > 0) {
    await screen.getByRole('dialog').getByRole('button', /Delete|Confirm|Yes/).tap();
  }
}

describe('clone yourself: avatars', { tags: ['tools', 'persona-clone'], session: 'member', timeout: 180_000 }, () => {
  // ── The page ─────────────────────────────────────────────────────────

  test('opens on My Avatars and its create form, under the plan\'s avatar capacity', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { avatars: clones(1, 'Studio') });
    await app.open(ROUTE);

    await expect(screen.getByRole('heading', TOOL_NAME)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByRole('tab', TAB.avatars)).toHaveAttribute('aria-selected', 'true');
    await expect(screen.getByRole('tab', SUBTAB.createAvatar)).toHaveAttribute('aria-selected', 'true');

    await expect(banner(browser)).toContainText('Avatar cloning');
    await expect(banner(browser)).toContainText('Available');
    await expect(banner(browser)).toContainText('1 of 3 avatar clones in use');
    await expect(banner(browser)).toContainText('2 remaining');

    // Nothing to create from yet
    await expect(nameBox(screen)).toHaveValue('');
    await expect(createButton(screen)).toBeDisabled();
  });

  // ── Creating ─────────────────────────────────────────────────────────

  test('a photo uploads, names the avatar after itself, and the avatar lands in the library', async ({ app, screen, browser }) => {
    const api = await mockPersonaClone(browser);
    await app.open(ROUTE);
    await expect(createButton(screen)).toBeDisabled({ timeout: 20_000 });

    await pickPhoto(browser);
    await expect(screen.getByText('face.png', { exact: false })).toBeVisible();
    await expect(nameBox(screen)).toHaveValue('face');
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });
    expect(api.uploads).toEqual([{ mediaKind: 'avatar', fileName: 'face.png' }]);

    await createButton(screen).tap();
    await expect.poll(() => api.creates.length, { timeout: 20_000 }).toBe(1);
    expect(api.creates[0]).toEqual({ kind: 'avatars', name: 'face', sourceUrl: uploadedUrl('avatar', 'face.png') });

    // The form is ready for the next one, and the slot is counted
    await expect(nameBox(screen)).toHaveValue('');
    await expect(screen.getByText('Drop a photo, or click to browse')).toBeVisible();
    await expect(banner(browser)).toContainText('1 of 3 avatar clones in use');

    await screen.getByRole('tab', new RegExp(SUBTAB.avatarLibrary)).tap();
    await expect(screen.getByText('face', { exact: true })).toBeVisible();
    await expect(screen.getByText('Ready')).toBeVisible();
  });

  test('a name typed first is kept over the photo\'s', async ({ app, screen, browser }) => {
    const api = await mockPersonaClone(browser);
    await app.open(ROUTE);

    await nameBox(screen).fill('Sara - Studio');
    await pickPhoto(browser);
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });
    await expect(nameBox(screen)).toHaveValue('Sara - Studio');

    await createButton(screen).tap();
    await expect.poll(() => api.creates.length, { timeout: 20_000 }).toBe(1);
    expect(api.creates[0].name).toBe('Sara - Studio');
  });

  test('an avatar needs a name', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser);
    await app.open(ROUTE);
    await pickPhoto(browser);
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });

    await nameBox(screen).fill('   ');
    await expect(createButton(screen)).toBeDisabled();
  });

  test('a file that is not an image is refused, with the reason', async ({ app, screen, browser }) => {
    const api = await mockPersonaClone(browser);
    await app.open(ROUTE);

    await pickPhoto(browser, FILES.notMedia);
    await expect(screen.getByText(TEXT.notImage)).toBeVisible({ timeout: 20_000 });
    await expect(createButton(screen)).toBeDisabled();
    expect(api.uploads).toHaveLength(0);
  });

  test('a picked photo can be taken back', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser);
    await app.open(ROUTE);
    await pickPhoto(browser);
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });

    await browser.locator('button.pc-shot__x').tap();
    await expect(screen.getByText('Drop a photo, or click to browse')).toBeVisible();
    await expect(createButton(screen)).toBeDisabled();
  });

  test('an upload that fails says so, and nothing can be created from it', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { uploadFails: true });
    await app.open(ROUTE);

    await pickPhoto(browser);
    await expect(screen.getByText(TEXT.uploadFailed)).toBeVisible({ timeout: 20_000 });
    await expect(createButton(screen)).toBeDisabled();
  });

  test('a refused clone says it was not saved, and keeps the photo and name', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { create: { refused: 'The photo could not be used.' } });
    await app.open(ROUTE);
    await pickPhoto(browser);
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });

    await createButton(screen).tap();
    await expect(screen.getByText(TEXT.saveFailed)).toBeVisible({ timeout: 20_000 });
    await expect(nameBox(screen)).toHaveValue('face');
    await expect(createButton(screen)).toBeEnabled();
  });

  test('a server error creating the clone says it was not saved', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { create: { httpStatus: 500 } });
    await app.open(ROUTE);
    await pickPhoto(browser);
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });

    await createButton(screen).tap();
    await expect(screen.getByText(TEXT.saveFailed)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(/Http failure/)).toHaveCount(0);
  });

  test('a clone over the plan\'s limit, refused by the server, offers the upgrade', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { create: { refused: 'Plan limit reached.', errorType: 'PlanLimitExceeded' } });
    await app.open(ROUTE);
    await pickPhoto(browser);
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });

    await createButton(screen).tap();
    const dialog = screen.getByRole('dialog');
    await expect(dialog.getByText('Upgrade Required')).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', 'Maybe Later').tap();
    await expect(screen.getByText(TEXT.saveFailed)).toHaveCount(0);
  });

  // ── The library ──────────────────────────────────────────────────────

  test('the library lists every avatar with its state', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, {
      avatars: [
        { id: 1, name: 'Ready One', sourceUrl: 'https://e2e-uploads.invalid/a1', status: 'Completed' },
        { id: 2, name: 'Busy One', sourceUrl: 'https://e2e-uploads.invalid/a2', status: 'Pending' },
        { id: 3, name: 'Broken One', sourceUrl: 'https://e2e-uploads.invalid/a3', status: 'Failed' }
      ]
    });
    await app.open(ROUTE);

    const library = screen.getByRole('tab', new RegExp(SUBTAB.avatarLibrary));
    await expect(library).toContainText('3', { timeout: 20_000 });
    await library.tap();
    for (const [name, state] of [['Ready One', 'Ready'], ['Busy One', 'Processing…'], ['Broken One', 'Failed']]) {
      await expect(screen.getByText(name)).toBeVisible();
      await expect(screen.getByText(state)).toBeVisible();
    }
  });

  test('an empty library says how to fill it', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser);
    await app.open(ROUTE);

    await screen.getByRole('tab', new RegExp(SUBTAB.avatarLibrary)).tap();
    await expect(screen.getByText(TEXT.avatarEmpty)).toBeVisible({ timeout: 20_000 });
  });

  test('the library pages eight at a time', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { avatars: clones(9), avatarCapacity: { limit: 20 } });
    await app.open(ROUTE);

    await screen.getByRole('tab', new RegExp(SUBTAB.avatarLibrary)).tap();
    await expect(screen.getByText('Showing 1–8 of 9')).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('Clone 9')).toHaveCount(0);

    await screen.getByRole('button', 'Next page').tap();
    await expect(screen.getByText('Clone 9')).toBeVisible();
    await expect(screen.getByText('Clone 1', { exact: true })).toHaveCount(0);
  });

  test('deleting an avatar removes it and frees its slot', async ({ app, screen, browser }) => {
    const api = await mockPersonaClone(browser, { avatars: clones(2) });
    await app.open(ROUTE);
    await expect(banner(browser)).toContainText('2 of 3 avatar clones in use', { timeout: 20_000 });

    await screen.getByRole('tab', new RegExp(SUBTAB.avatarLibrary)).tap();
    await deleteClone(screen, browser, 0);

    await expect.poll(() => api.deletes.length, { timeout: 20_000 }).toBe(1);
    expect(api.deletes[0]).toEqual({ kind: 'avatars', id: 500 });
    await expect(screen.getByText('Clone 1', { exact: true })).toHaveCount(0);
    await expect(screen.getByText('Clone 2')).toBeVisible();
    await expect(banner(browser)).toContainText('1 of 3 avatar clones in use');
  });

  // A clone is a trained HeyGen asset, gone for good once deleted — and the
  // trash icon deleted it on one tap, with nothing to confirm. My Projects
  // asks before deleting a project.
  test('deleting an avatar asks first', async ({ app, screen, browser }) => {
    const api = await mockPersonaClone(browser, { avatars: clones(1) });
    await app.open(ROUTE);
    await screen.getByRole('tab', new RegExp(SUBTAB.avatarLibrary)).tap();
    await expect(screen.getByText('Clone 1')).toBeVisible({ timeout: 20_000 });

    await browser.locator('button.pc-item__del').first().tap();
    await expect(screen.getByRole('dialog')).toBeVisible();
    expect(api.deletes).toHaveLength(0);
  });

  // A delete that fails is swallowed (`error: () => {}`): the avatar simply
  // stays, with no word that anything was tried.
  test('a delete that fails says so', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { avatars: clones(1), deleteFails: true });
    await app.open(ROUTE);
    await screen.getByRole('tab', new RegExp(SUBTAB.avatarLibrary)).tap();
    await expect(screen.getByText('Clone 1')).toBeVisible({ timeout: 20_000 });

    await deleteClone(screen, browser, 0);
    await expect(screen.getByText(/couldn.t delete|could not delete|failed|try again/i)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText('Clone 1')).toBeVisible();
  });

  // A library that cannot be read is shown as an empty one — "No avatars
  // yet" — which tells someone with avatars that they have none.
  test('a library that cannot be read does not claim to be empty', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { avatars: clones(2), listFails: true });
    await app.open(ROUTE);

    await screen.getByRole('tab', new RegExp(SUBTAB.avatarLibrary)).tap();
    await expect(browser.locator('.pc-loading')).toHaveCount(0, { timeout: 20_000 });
    await expect(screen.getByText(TEXT.avatarEmpty)).toHaveCount(0);
  });

  // ── The plan ─────────────────────────────────────────────────────────

  test('at the plan\'s limit the form closes and the banner offers an upgrade', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { avatars: clones(3), avatarCapacity: { limit: 3 } });
    await app.open(ROUTE);

    await expect(banner(browser)).toContainText('Limit reached', { timeout: 20_000 });
    await expect(banner(browser)).toContainText("You've reached your plan's avatar cloning limit.");
    await expect(nameBox(screen)).toBeDisabled();
    await expect(createButton(screen)).toBeDisabled();

    await screen.getByRole('button', /Upgrade plan/).tap();
    await expect(browser).toHaveURL('/pricing');
  });

  test('on a plan without avatar cloning the form is locked and the banner points to the plans', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { avatarCapacity: { limit: 0 } });
    await app.open(ROUTE);

    await expect(banner(browser)).toContainText('Not available', { timeout: 20_000 });
    await expect(banner(browser)).toContainText("Avatar cloning isn't available on your current plan.");
    await expect(nameBox(screen)).toBeDisabled();

    await screen.getByRole('button', /View plans/).tap();
    await expect(browser).toHaveURL('/pricing');
  });

  test('on an unlimited plan the banner says so, with no meter', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { avatars: clones(4), avatarCapacity: { limit: 0, isUnlimited: true } });
    await app.open(ROUTE);

    await expect(banner(browser)).toContainText('Unlimited', { timeout: 20_000 });
    await expect(banner(browser)).toContainText('Unlimited avatar cloning is included in your plan.');
    await expect(browser.locator('.cc-banner__meter')).toHaveCount(0);
    await expect(nameBox(screen)).toBeEnabled();
  });

  // The capacity banner hides while the plan "loads" — and a plan that failed
  // to load never stops loading, so the form sits disabled with no banner and
  // no reason given.
  test('if the plan cannot be read, the closed form says why', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser, { capabilitiesFail: true });
    await app.open(ROUTE);
    await expect(screen.getByRole('heading', TOOL_NAME)).toBeVisible({ timeout: 20_000 });

    await expect(nameBox(screen)).toBeDisabled();
    await expect(banner(browser)).toBeVisible({ timeout: 10_000 });
  });

  // ── Around the form ──────────────────────────────────────────────────

  // The tabs are drawn with @if, so looking at My Voices destroys the avatar
  // form: the picked (and already uploaded) photo and the typed name are gone
  // on the way back.
  test('a look at My Voices keeps the avatar being made', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser);
    await app.open(ROUTE);
    await nameBox(screen).fill('Sara - Studio');
    await pickPhoto(browser);
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });

    await screen.getByRole('tab', TAB.voices).tap();
    await screen.getByRole('tab', TAB.avatars).tap();
    await expect(nameBox(screen)).toHaveValue('Sara - Studio');
    await expect(createButton(screen)).toBeEnabled();
  });

  test('switching the site to Arabic keeps the avatar being made', async ({ app, screen, browser }) => {
    await mockPersonaClone(browser);
    await app.open(ROUTE);
    await nameBox(screen).fill('Sara - Studio');
    await pickPhoto(browser);
    await expect(createButton(screen)).toBeEnabled({ timeout: 20_000 });

    await switchToArabic(screen);
    await expect(screen.getByRole('heading', TOOL_NAME_AR)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByDisplayValue('Sara - Studio')).toBeVisible();
  });
});
