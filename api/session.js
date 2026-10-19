// Sign-in for the dashboard: one shared team password (DASHBOARD_PASSWORD).
// GET → are we signed in; POST { password } → sign in; DELETE → sign out.
import { checkPassword, clearSessionCookie, HttpError, requireUser, route, setSessionCookie } from './_lib.js';

export default route(['GET', 'POST', 'DELETE'], async (req, res) => {
  if (req.method === 'GET') {
    try {
      requireUser(req);
      res.json({ signedIn: true });
    } catch {
      res.json({ signedIn: false });
    }
    return;
  }
  if (req.method === 'DELETE') {
    clearSessionCookie(res);
    res.json({ signedIn: false });
    return;
  }
  if (!checkPassword(req.body?.password)) throw new HttpError(401, 'Wrong password');
  setSessionCookie(res);
  res.json({ signedIn: true });
});
