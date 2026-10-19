import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { signIn } from '../helpers/login.ts';

// Signs in once per run and saves the browser state as the `member` session;
// tests in any folder that declare `{ session: 'member' }` start already logged in.
test.setup('sign in as member', { sessions: ['member'] }, async ({ app, screen, session, browser }) => {
  await app.open('/');
  await signIn(screen);
  await expect(browser).toHaveURL('/home', { timeout: 20_000 }); // prove the sign-in worked before saving
  await session.save('member');
});
