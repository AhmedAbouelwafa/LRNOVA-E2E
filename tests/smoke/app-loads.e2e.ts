import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('smoke', { tags: ['smoke'] }, () => {
  test('the app boots and shows the login page', async ({ app, browser }) => {
    await app.open('/');
    await expect(browser).toHaveTitle('LRNOVA');
    // Angular rendered the route: the login form is on screen.
    await expect(browser.locator('#login-email')).toBeVisible();
    await expect(browser.locator('#login-password')).toBeVisible();
    await expect(browser.locator('button[type="submit"]')).toBeVisible();
  });

  test('the agent sees a sign-in form', async ({ app, agent }) => {
    await app.open('/');
    await agent.assert('the page shows a sign-in form with email and password fields');
  });
});
