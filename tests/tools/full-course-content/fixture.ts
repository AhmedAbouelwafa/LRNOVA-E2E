import type { Answer } from '../../helpers/questionnaire.ts';

/** Full Course Content Generator — "Course Content Agent" in the English UI. */
export const TOOL_ID = 9;
export const ROUTE = `/tools/full-course-content-tool/${TOOL_ID}`;
export const ENDPOINT = 'FullCourseContentTool';
export const TOOL_NAME = 'Course Content Agent';
export const TOOL_NAME_AR = 'مولد الدورات التدريبية';

/** 12 inputs, the age range's two halves asked as one. No question depends on the language. */
export const TOTAL = 11;

export const PLACEHOLDER = {
  courseTitle: 'Enter course title',
  // The API sends this one with a trailing line break ("e.g., Team Building\r\n"); the page trims it
  learningGoal: 'e.g., Team Building',
  targetAudience: 'e.g., Managers, Team Leads',
  notes: 'Additional notes'
};

export const COURSE = {
  title: 'Listening at Work',
  goal: 'Run calmer customer calls',
  audience: 'Customer support agents'
};

/**
 * Every answer up to, not including, the last question (Additional Notes).
 * Course Hours is a 1–90 slider that starts at 1; it is left there.
 */
export const ANSWERS: Answer[] = [
  { placeholder: PLACEHOLDER.courseTitle, value: COURSE.title },
  { placeholder: PLACEHOLDER.learningGoal, value: COURSE.goal },
  { placeholder: PLACEHOLDER.targetAudience, value: COURSE.audience },
  { choose: 'Beginner' },
  { ages: [20, 30] },
  { choose: 'English' },
  { choose: '2 Modules' },
  { choose: '1 Topic' },
  'continue', // Course Hours
  'skip' // Reference File
];

/** What those answers send. */
export const INPUTS = {
  courseTitle: COURSE.title,
  learningGoal: COURSE.goal,
  targetAudience: COURSE.audience,
  courseLevel: 'beginner',
  ageMin: '20',
  ageMax: '30',
  language: 'English',
  numberOfModules: '2',
  numberOfTopics: '1',
  hours: 1
};

export const SECTIONS = {
  preamble: 'A two-module course on listening before answering.',
  module1: 'Module 1: Listening Basics',
  module1Body: 'Listening starts before you answer.',
  topic1: 'Topic 1.1: The whole question',
  module2: 'Module 2: Practice'
};

/** The course the stubbed API returns: markdown the page folds by heading. */
export const OUTPUT = {
  title: COURSE.title,
  direction: 'ltr',
  content: [
    SECTIONS.preamble,
    '',
    `## ${SECTIONS.module1}`,
    '',
    SECTIONS.module1Body,
    '',
    `### ${SECTIONS.topic1}`,
    '',
    'Wait for the full question before you reply.',
    '',
    `## ${SECTIONS.module2}`,
    '',
    'Pair exercises with a timer.',
    ''
  ].join('\n')
};

/** The same course written in Arabic. */
export const OUTPUT_AR = {
  title: 'الاستماع في العمل',
  direction: 'rtl',
  content: '## الوحدة الأولى: أساسيات الاستماع\n\nالاستماع يبدأ قبل أن تجيب.\n'
};
