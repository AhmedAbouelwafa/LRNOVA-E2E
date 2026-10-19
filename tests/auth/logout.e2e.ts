import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { signIn } from '../helpers/login.ts';

describe('logout', { tags: ['auth'] }, () => {
  // Signs in on its own instead of using the shared session: logging out
  // revokes the token on the server, which would break the other tests.
  test('logging out returns to login and locks protected pages again', async ({ app, screen, browser, agent }) => {
    await app.open('/');
    await signIn(screen);
    await expect(browser).toHaveURL('/home', { timeout: 20_000 });

    // The agent finds Logout in the user menu; the checks below let the
    // replay cache record it, so later runs replay it without a model call.
    await agent.act('log out of the account using the user menu');
    await expect(browser).toHaveURL('/');
    await expect(screen.getByLabel('Enter your email')).toBeVisible();

    await app.open('/home');
    await expect(browser).toHaveURL(/returnUrl=%2Fhome/);
  });
});
