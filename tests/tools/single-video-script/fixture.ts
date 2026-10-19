import type { Answer } from '../../helpers/questionnaire.ts';

/** Single Video Script Generator — "Video Script Agent" in the English UI. */
export const TOOL_ID = 2;
export const ROUTE = `/tools/single-video-script-tool/${TOOL_ID}`;
export const ENDPOINT = 'SingleVideoScriptTool';
export const TOOL_NAME = 'Video Script Agent';
export const TOOL_NAME_AR = 'مولد نصوص الفيديوهات';

/**
 * Questions on screen with an English video: 13 inputs, less Feedback (never
 * asked), the age range's "To" half (asked beside "From") and Slang (asked only
 * for Arabic). Arabic adds Slang back: 11.
 */
export const TOTAL = 10;
export const TOTAL_ARABIC = 11;

export const PLACEHOLDER = {
  topicArea: 'Main subject',
  topicObjective: 'Topic goal',
  targetAudience: 'e.g., Managers, Team Leads',
  notes: 'Additional notes',
  script: 'Enter your script here...'
};

export const VIDEO = {
  topic: 'Active Listening',
  objective: 'Listen before answering',
  audience: 'Customer support agents'
};

/** Every answer up to, not including, the last question (Additional Notes). */
export const ANSWERS: Answer[] = [
  { placeholder: PLACEHOLDER.topicArea, value: VIDEO.topic },
  { placeholder: PLACEHOLDER.topicObjective, value: VIDEO.objective },
  { placeholder: PLACEHOLDER.targetAudience, value: VIDEO.audience },
  { ages: [20, 30] },
  { choose: 'Beginner' },
  { choose: 'Practical' },
  { choose: 'English' },
  { choose: '2 min' },
  'skip' // Reference File
];

/** What those answers send. */
export const INPUTS = {
  topicArea: VIDEO.topic,
  topicObjective: VIDEO.objective,
  targetAudience: VIDEO.audience,
  ageMin: '20',
  ageMax: '30',
  knowledgeLevel: 'Beginner',
  engagementStyle: 'practical',
  language: 'English',
  minutes: '2'
};

export const SCRIPT_LINES = {
  hook: 'Have you ever answered a question nobody asked?',
  close: 'Next call, count to two before you reply.'
};

/** The script the stubbed API returns. */
export const OUTPUT = {
  direction: 'ltr',
  script: `${SCRIPT_LINES.hook}\n\nActive listening means hearing the whole question first.\n\n${SCRIPT_LINES.close}`
};

/** The same script written for an Arabic video. */
export const OUTPUT_AR = {
  direction: 'rtl',
  script: 'هل سبق أن أجبت عن سؤال لم يسأله أحد؟\n\nالاستماع الفعال يبدأ بسماع السؤال كاملًا.'
};
