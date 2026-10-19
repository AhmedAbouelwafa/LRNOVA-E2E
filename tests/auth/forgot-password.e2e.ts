import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('forgot password page', { tags: ['auth'] }, () => {
  // Sending the reset email sits behind reCAPTCHA, so these tests stop before it.
  test('is reachable from the login page', async ({ app, screen, browser }) => {
    await app.open('/');
    await screen.getByRole('link', 'Forgot password?').tap();
    await expect(browser).toHaveURL('/forgot-password');
    await expect(screen.getByRole('heading', 'Forgot Password')).toBeVisible();
  });

  test('rejects an invalid email and keeps Send disabled', async ({ app, screen }) => {
    await app.open('/forgot-password');
    await screen.getByLabel('Enter your email').fill('not-an-email');
    await screen.getByRole('heading', 'Forgot Password').tap(); // blur the field

    await expect(screen.getByText('Not a valid email')).toBeVisible();
    await expect(screen.getByRole('button', 'Send Password Reset Email')).toBeDisabled();
  });
});
