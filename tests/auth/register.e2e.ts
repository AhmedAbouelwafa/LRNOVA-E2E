import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

describe('register page', { tags: ['auth'] }, () => {
  // Registration itself sits behind reCAPTCHA, so these tests check the form
  // and stop before submitting.
  test('is reachable from the login page', async ({ app, screen, browser }) => {
    await app.open('/');
    await screen.getByRole('link', 'Create account').tap();
    await expect(browser).toHaveURL('/register');
    await expect(screen.getByRole('heading', 'Create your LRNOVA account')).toBeVisible();
  });

  test('flags mismatched passwords and keeps Register disabled', async ({ app, screen }) => {
    await app.open('/register');
    await screen.getByLabel('Enter your password').fill('Str0ng#Pass1');
    await screen.getByLabel('Enter your confirm password').fill('Different#Pass2');
    await screen.getByRole('heading', 'Create your LRNOVA account').tap(); // blur the confirm field

    await expect(screen.getByText('Passwords do not match')).toBeVisible();
    await expect(screen.getByRole('button', 'Register')).toBeDisabled();
  });

  test('links back to login', async ({ app, screen, browser }) => {
    await app.open('/register');
    await screen.getByRole('link', 'Login account').tap();
    await expect(browser).toHaveURL('/login');
  });
});
