import type { Answer } from '../../helpers/questionnaire.ts';

/** Activity / Workshop Generator — "Activity Agent" in the English UI. */
export const TOOL_ID = 7;
export const ROUTE = `/tools/activity-generator-tool/${TOOL_ID}`;
export const ENDPOINT = 'ActivityGeneratorTool';
export const TOOL_NAME = 'Activity Agent';
export const TOOL_NAME_AR = 'منشئ الانشطة والتدريبات العملية';

/** 13 inputs, the age range's two halves asked as one. No question depends on the language. */
export const TOTAL = 12;

export const PLACEHOLDER = {
  activityTopic: 'e.g., Leadership',
  activityObjective: 'e.g., Communication, Planning',
  targetAudience: 'e.g., Managers, Team Leads',
  availableResources: 'Enter available resources',
  extraNotes: 'e.g., Focus on conflict resolution',
  title: 'Enter activity title...',
  objective: 'Enter objective...'
};

export const ACTIVITY = {
  topic: 'Active Listening',
  objective: 'Hear the whole question',
  audience: 'Customer support agents'
};

/** Every answer up to, not including, the last question (Extra Notes). */
export const ANSWERS: Answer[] = [
  { placeholder: PLACEHOLDER.activityTopic, value: ACTIVITY.topic },
  { placeholder: PLACEHOLDER.activityObjective, value: ACTIVITY.objective },
  { choose: 'Roleplay' },
  { placeholder: PLACEHOLDER.targetAudience, value: ACTIVITY.audience },
  { ages: [20, 30] },
  { choose: 'Beginner' },
  { choose: 'English' },
  { choose: '15 min' },
  { choose: 'Classroom' },
  'skip', // Available Resources
  'skip' // Reference File
];

/** What those answers send. */
export const INPUTS = {
  activityTopic: ACTIVITY.topic,
  activityObjective: ACTIVITY.objective,
  activityType: 'Roleplay',
  targetAudience: ACTIVITY.audience,
  ageMin: '20',
  ageMax: '30',
  knowledgeLevel: 'Beginner',
  language: 'English',
  duration: '15',
  deliveryMethod: 'Classroom'
};

/** The activity the stubbed API returns, every section filled. */
export const OUTPUT = {
  status: 'success',
  direction: 'ltr',
  activity: {
    title: 'Listening Pairs',
    objective: 'Practise hearing the whole question before answering.',
    materialsNeeded: ['Timer', 'Question cards'],
    preparation: ['Print one deck of question cards per pair'],
    steps: ['Pair up', 'One partner asks, the other listens for two minutes', 'Swap roles'],
    expectedOutcomes: ['Participants pause before they answer'],
    evaluation: ['Count the pauses each listener takes'],
    adaptations: ['Online: use breakout rooms'],
    safetyNotes: ['Keep pairing voluntary'],
    caseStudy: 'A support agent waited for the whole question and solved the call in half the time.',
    direction: 'ltr'
  }
};

/** The same activity written in Arabic. */
export const OUTPUT_AR = {
  status: 'success',
  direction: 'rtl',
  activity: { ...OUTPUT.activity, title: 'ثنائيات الاستماع', objective: 'التدرب على سماع السؤال كاملًا قبل الإجابة.', direction: 'rtl' }
};
