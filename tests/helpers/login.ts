import type { Screen } from 'e2e';
import { credentials } from 'e2e';

/** Fills the login form at `/` with the dev account and submits it. */
export async function signIn(screen: Screen): Promise<void> {
  const member = credentials.user('member');
  await screen.getByLabel('Enter your email').fill(member.username);
  await screen.getByLabel('Enter your password').fill(member.password);
  await screen.getByRole('button', 'Login').tap();
}
