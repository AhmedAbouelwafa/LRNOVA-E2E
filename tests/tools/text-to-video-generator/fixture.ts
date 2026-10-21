import type { Answer } from '../../helpers/questionnaire.ts';
import type { SavedTextVideoJob, Storyboard } from '../../helpers/text-video-api.ts';

/**
 * Text-to-Video Generator — "Explainer Video Agent" in the English UI.
 *
 * Asks its own ten questions (the same step panels the text tools use, not
 * the shared questionnaire), then works in two stages: a storyboard to review
 * and edit, and the video rendered from it. Both are stubbed
 * (`mockTextVideoApi`): the storyboard is a model call, the render spends
 * credits.
 */
export const ROUTE = '/tools/text-to-video-generator';
export const TOOL_NAME = 'Explainer Video Agent';
export const TOOL_NAME_AR = 'فيديو توضيحي';

export const TOTAL = 10;

export const PLACEHOLDER = {
  prompt: 'Example: Create an educational video about the importance of reading for students...',
  audience: 'e.g. university students, new employees...',
  notes: 'Add any instructions...'
};

/** The voice a fresh form narrates with, sent as-is. */
export const DEFAULT_VOICE = 'ar-001_Algenib_egyptian';

export const VIDEO = {
  prompt: 'Why active listening matters on customer support calls',
  audience: 'Customer support agents'
};

/** The canvas tabs; a finished one's name grows a "Completed" suffix. */
export const TAB = {
  storyboard: /^Storyboard/,
  video: /^Video/,
  storyboardAr: /^المخطط/
};

/** A duration pill: the minutes over a "min" unit. */
export const minutes = (n: number) => new RegExp(`^${n}\\s*min$`);

/**
 * Every answer up to, not including, the last question (Notes, which carries
 * Generate), in the order asked: the style first. Style and voice keep their
 * defaults (Realistic, the default voice); the duration is moved off its
 * default to show it is sent.
 */
export const ANSWERS: Answer[] = [
  'continue', // Style, left on Realistic
  { placeholder: PLACEHOLDER.prompt, value: VIDEO.prompt },
  { placeholder: PLACEHOLDER.audience, value: VIDEO.audience },
  { ages: [20, 30] },
  { choose: 'Intermediate' },
  'continue', // Voice, left on the default
  { choose: 'Portrait' },
  { press: minutes(3) },
  'skip' // Reference File
];

/** What those answers send to stage 1. */
export const REQUEST = {
  prompt: VIDEO.prompt,
  style: 'realistic',
  orientation: 'portrait',
  imageModel: 2,
  voice: DEFAULT_VOICE,
  estimatedDurationMinutes: 3,
  targetAudience: VIDEO.audience,
  ageMin: '20',
  ageMax: '30',
  knowledgeLevel: 'intermediate',
  notes: null,
  referenceLink: null
};

export const STORYBOARD: Storyboard = {
  title: 'Listening first',
  scenes: [
    {
      sceneNumber: 1,
      narration: 'Every good answer starts with listening.',
      visualDescription: 'A support agent in a headset nods while a customer speaks.',
      estimatedDurationSeconds: 20
    },
    {
      sceneNumber: 2,
      narration: 'Repeat the question back before you reply.',
      visualDescription: 'The agent types a short summary of the question.',
      estimatedDurationSeconds: 25
    },
    {
      sceneNumber: 3,
      narration: 'Then answer the question that was asked.',
      visualDescription: 'The customer smiles as the call ends.',
      estimatedDurationSeconds: 15
    }
  ]
};

/** A job opened from My Projects; `status` is the test's. */
export function savedJob(status: SavedTextVideoJob['status'], extra: Partial<SavedTextVideoJob> = {}): SavedTextVideoJob {
  return {
    id: 777,
    status,
    name: 'Saved Explainer',
    storyboard: STORYBOARD,
    errorMessage: status === 'Failed' ? 'The narration could not be voiced.' : undefined,
    inputs: {
      prompt: VIDEO.prompt,
      style: 'whiteboard',
      orientation: 'portrait',
      voice: DEFAULT_VOICE,
      targetAudience: VIDEO.audience,
      ageMin: '20',
      ageMax: '30',
      knowledgeLevel: 'intermediate',
      estimatedDurationSeconds: 180
    },
    ...extra
  };
}

/** The vocabulary of this tool's screens, for the agent; part of the replay cache's key. */
export const TEXT_TO_VIDEO_CONTEXT = [
  'This is the Explainer Video Agent in the LRNOVA dashboard: it turns answers into a storyboard, then the storyboard into a video.',
  'Before a storyboard exists the page asks its inputs one question at a time, under a "Question n/total" pill and an "answered / total" counter.',
  'A typed answer is confirmed with the Continue button. Each choice is a button whose name starts with a letter badge, e.g. "A Beginner"; picking one moves on by itself.',
  'The age range is a row of "<n> years" chips: tap one end, tap the other end, then Continue.',
  'The first question is the video style; style and voice are chosen in a popup opened from the question\'s picker button, and kept with Confirm.',
  'The last question (Notes) has the Generate button. The storyboard then shows scenes with Edit and Generate video buttons.'
].join(' ');
