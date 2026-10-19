/**
 * Video AI Generator — "Avatar Video Agent" in the English UI.
 *
 * Not a questionnaire tool: it opens on three ways to start (write a script,
 * have one written, upload audio), asks one question for the chosen way, then
 * hands over to the avatar dialog, which starts a render job the page polls.
 *
 * Every call that could start a render is stubbed (`mockVideoApi`) or aborted
 * (`blockVideoRenders`): a real one spends the account's credits.
 */
export const TOOL_ID = 5;
export const ROUTE = `/tools/video-ai-generator/${TOOL_ID}`;
export const TOOL_NAME = 'Avatar Video Agent';
export const TOOL_NAME_AR = 'أفاتار فيديو';

export const ROUTES = {
  write: /Write Your Script/,
  ai: /Generate with AI/,
  audio: /Upload Audio/
};

export const SCRIPT =
  'Welcome to active listening. Today we practise hearing the whole question before we answer it.';

export const JOB_ID = 4242;
