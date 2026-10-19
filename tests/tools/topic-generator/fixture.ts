import type { Answer } from '../../helpers/questionnaire.ts';

/** Topic / Lesson Generator — "Lesson Agent" in the English UI. */
export const TOOL_ID = 6;
export const ROUTE = `/tools/topic-generator-tool/${TOOL_ID}`;
export const ENDPOINT = 'TopicGeneratorTool';
export const TOOL_NAME = 'Lesson Agent';
export const TOOL_NAME_AR = 'مولد الدروس التعليمية';

/**
 * Questions on screen: 13 inputs, less Feedback (never asked) and the age
 * range's "To" half. No question depends on the language here, so the count
 * is the same for an Arabic lesson. The last two are toggles, on by default.
 */
export const TOTAL = 11;

export const PLACEHOLDER = {
  topicArea: 'Main subject',
  topicObjective: 'Topic goal',
  targetAudience: 'Ex: University students, entrepreneurs, engineers',
  extraNotes: 'Any notes?'
};

export const LESSON = {
  topic: 'Active Listening',
  objective: 'Listen before answering',
  audience: 'Customer support agents'
};

/** Every answer up to, not including, the last question (Instructor Guide). */
export const ANSWERS: Answer[] = [
  { placeholder: PLACEHOLDER.topicArea, value: LESSON.topic },
  { placeholder: PLACEHOLDER.topicObjective, value: LESSON.objective },
  { placeholder: PLACEHOLDER.targetAudience, value: LESSON.audience },
  { ages: [20, 30] },
  { choose: 'Beginner' },
  { choose: 'English' },
  { choose: '2' }, // Number of Pages
  'skip', // Reference File
  'skip', // Extra Notes
  'continue' // Include Conclusion, left on
];

/** What those answers send. */
export const INPUTS = {
  topicArea: LESSON.topic,
  topicObjective: LESSON.objective,
  targetAudience: LESSON.audience,
  ageMin: '20',
  ageMax: '30',
  knowledgeLevel: 'Beginner',
  language: 'English',
  length: '2',
  conclusion: true,
  instructorGuide: true
};

export const LESSON_TEXT = {
  heading: 'Why listening comes first',
  body: 'Listening starts before you answer.',
  item: 'Hear the whole question'
};

/** The lesson the stubbed API returns, as the markdown the tool asks for. */
export const OUTPUT = {
  status: 'succeeded',
  direction: 'ltr',
  generatedTopic: `## ${LESSON_TEXT.heading}\n\n${LESSON_TEXT.body}\n\n- ${LESSON_TEXT.item}\n- Pause before replying\n`
};

/** The same lesson written in Arabic. */
export const OUTPUT_AR = {
  status: 'succeeded',
  direction: 'rtl',
  generatedTopic: '## لماذا يأتي الاستماع أولًا\n\nالاستماع يبدأ قبل أن تجيب.\n'
};
