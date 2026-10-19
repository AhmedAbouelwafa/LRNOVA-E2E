import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { signIn } from '../helpers/login.ts';

describe('authorization', { tags: ['auth'] }, () => {
  test('a guest opening a protected page is sent to login with a returnUrl', async ({ app, screen, browser }) => {
    await app.open('/home');
    await expect(browser).toHaveURL(/\/\?returnUrl=%2Fhome$/);
    await expect(screen.getByLabel('Enter your email')).toBeVisible();
  });

  test('after login the guest returns to the page they asked for', async ({ app, screen, browser }) => {
    await app.open('/my-projects');
    await expect(browser).toHaveURL(/returnUrl=%2Fmy-projects/);
    await signIn(screen);
    await expect(browser).toHaveURL('/my-projects', { timeout: 20_000 });
  });

  test('a signed-in member opens protected pages directly', { session: 'member' }, async ({ app, browser }) => {
    await app.open('/home');
    await expect(browser).toHaveURL('/home');
    await expect(browser.locator('h1.wk-head__greeting')).toBeVisible();
  });

  test('a signed-in member visiting the login page is sent to /home', { session: 'member' }, async ({ app, browser }) => {
    await app.open('/');
    await expect(browser).toHaveURL('/home', { timeout: 10_000 });
  });
});
