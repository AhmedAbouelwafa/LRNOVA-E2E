// Sign-in for the dashboard: one shared team password (DASHBOARD_PASSWORD).
// GET → are we signed in; POST { password } → sign in; DELETE → sign out.
// Signed-in answers also say whether the "Local" environment is offered here.
import { checkPassword, clearSessionCookie, HttpError, localBuildEnabled, requireUser, route, setSessionCookie } from './_lib.js';

export default route(['GET', 'POST', 'DELETE'], async (req, res) => {
  if (req.method === 'GET') {
    try {
      requireUser(req);
      res.json({ signedIn: true, localBuild: localBuildEnabled() });
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
  res.json({ signedIn: true, localBuild: localBuildEnabled() });
});
