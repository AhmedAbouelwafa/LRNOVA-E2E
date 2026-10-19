import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { signIn } from '../helpers/login.ts';

describe('login', { tags: ['auth'] }, () => {
  test('rejects a wrong password and stays on the login page', async ({ app, screen, browser }) => {
    await app.open('/');
    await screen.getByLabel('Enter your email').fill('ali@gmail.com');
    await screen.getByLabel('Enter your password').fill('WrongPass#999');
    await screen.getByRole('button', 'Login').tap();

    await expect(screen.getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await expect(browser).toHaveURL('/');
  });

  test('validates the email and password before submitting', async ({ app, screen }) => {
    await app.open('/');
    await expect(screen.getByRole('button', 'Login')).toBeDisabled();

    await screen.getByLabel('Enter your email').fill('not-an-email');
    await screen.getByLabel('Enter your password').fill('short');
    await screen.getByLabel('Enter your email').focus(); // leaving the password field marks it touched

    await expect(screen.getByText('Not a valid email')).toBeVisible();
    await expect(screen.getByText('Password must be at least 8 characters')).toBeVisible();
    await expect(screen.getByRole('button', 'Login')).toBeDisabled();
  });

  test('a valid login lands on /home', async ({ app, screen, browser }) => {
    await app.open('/');
    await signIn(screen);
    await expect(browser).toHaveURL('/home', { timeout: 20_000 });
    await expect(browser.locator('h1.wk-head__greeting')).toBeVisible();
  });
});
