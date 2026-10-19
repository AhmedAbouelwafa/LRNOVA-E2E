import type { Answer } from '../../helpers/questionnaire.ts';

/** Full Course Script Generator — "Course Script Agent" in the English UI. */
export const TOOL_ID = 1;
export const ROUTE = `/tools/full-course-script-tool/${TOOL_ID}`;
export const ENDPOINT = 'FullCourseScriptTool';
export const TOOL_NAME = 'Course Script Agent';
/** The same tool's name in the Arabic UI, as the API returns it. */
export const TOOL_NAME_AR = 'مولد دورات الفيديو';

/**
 * Questions on screen with an English course: 14 inputs, less Feedback (never
 * asked), the age range's "To" half (asked beside "From") and Slang (asked only
 * for an Arabic course). Arabic adds Slang back: 12.
 */
export const TOTAL = 11;
export const TOTAL_ARABIC = 12;

export const PLACEHOLDER = {
  courseTitle: 'Enter course title',
  learningGoal: 'e.g., Team Building',
  targetAudience: 'e.g., Managers, Team Leads',
  notes: 'e.g., Enter details here...'
};

export const COURSE = {
  title: 'Time Management Basics',
  goal: 'Plan a productive week',
  audience: 'New team leads'
};

/** Every answer up to, not including, the last question (Additional Notes). */
export const ANSWERS: Answer[] = [
  { placeholder: PLACEHOLDER.courseTitle, value: COURSE.title },
  { placeholder: PLACEHOLDER.learningGoal, value: COURSE.goal },
  { placeholder: PLACEHOLDER.targetAudience, value: COURSE.audience },
  { ages: [20, 30] },
  { choose: 'Beginner' },
  { choose: 'Practical' },
  { choose: 'English' },
  { choose: '1 module' },
  { choose: '2 topics' },
  'skip' // Reference File
];

/** The document the stubbed API returns: one module, two topics, three videos. */
export const OUTPUT = {
  direction: 'ltr',
  courseData: {
    courseTitle: COURSE.title,
    courseOverview: '## Why this course\n\nA short course on planning a productive week.',
    courseIntro: 'Welcome to Time Management Basics.',
    courseConclusion: 'You can now plan a productive week.',
    modules: [
      {
        moduleNumber: 1,
        moduleIntro: 'This module covers weekly planning.',
        moduleConclusion: 'You have finished weekly planning.',
        topics: [
          {
            topicNumber: 1,
            videos: [
              { vidNumber: 1, script: 'Video one: list every task for the week.' },
              { vidNumber: 2, script: 'Video two: sort the list by priority.' }
            ]
          },
          {
            topicNumber: 2,
            videos: [{ vidNumber: 3, script: 'Video three: block time on the calendar.' }]
          }
        ]
      }
    ]
  }
};

/**
 * Videos the overview head counts: three topic videos, the module's intro and
 * conclusion, the course's intro and conclusion.
 */
export const COURSE_VIDEOS = 7;
export const MODULE_VIDEOS = 5;
