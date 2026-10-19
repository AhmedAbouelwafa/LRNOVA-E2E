import type { Screen } from 'e2e';
import { expect } from 'e2e';
import type { Answer } from '../../helpers/questionnaire.ts';

/**
 * Assessment / Quiz Generator — "Assessment Agent" in the English UI.
 *
 * The one text tool whose form is static: its questions are declared in the
 * component and translated there, not fetched. After Language it asks a
 * "question mix" of its own — rows of question type and count — which counts
 * as a step and holds the flow until it has a row.
 */
export const TOOL_ID = 3;
export const ROUTE = `/tools/assessment-tool/${TOOL_ID}`;
export const ENDPOINT = 'AssessmentTool';
export const TOOL_NAME = 'Assessment Agent';

/** Ten questions (the age range's two halves are one) plus the question mix. */
export const TOTAL = 11;

/** The questions' placeholders are their own names: the static fields set none. */
export const PLACEHOLDER = {
  topic: 'General Topic',
  details: 'Sub Topic',
  targetAudience: 'Target Audience',
  extraNotes: 'Extra Notes',
  questionCount: 'e.g., 5'
};

export const QUIZ = {
  topic: 'Active Listening',
  details: 'Asking clarifying questions',
  audience: 'Customer support agents'
};

/** Every answer up to Language; the question mix comes next. */
export const ANSWERS_TO_MIX: Answer[] = [
  { placeholder: PLACEHOLDER.topic, value: QUIZ.topic },
  { placeholder: PLACEHOLDER.details, value: QUIZ.details },
  { placeholder: PLACEHOLDER.targetAudience, value: QUIZ.audience },
  { ages: [20, 30] },
  { choose: 'Beginner' },
  { choose: 'Medium' },
  { choose: 'English' }
];

/** After the mix: Reference File and Extra Notes, skipped; Include Explanation is last. */
export const ANSWERS_AFTER_MIX: Answer[] = ['skip', 'skip'];

/** What those answers send, with one row of the default type and count. */
export const INPUTS = {
  topic: QUIZ.topic,
  details: QUIZ.details,
  targetAudience: QUIZ.audience,
  ageMin: '20',
  ageMax: '30',
  knowledgeLevel: 'Beginner',
  questionsLevel: 'medium',
  language: 'English',
  explanation: false,
  referenceLink: '',
  questions: [{ type: 'Multiple Choice', points: 1 }]
};

/** Adds a question-mix row; a new row is one Multiple Choice question. */
export async function addQuestionRow(screen: Screen): Promise<void> {
  const rows = await screen.getByPlaceholder(PLACEHOLDER.questionCount).count();
  await screen.getByRole('button', 'Add Question').tap();
  await expect(screen.getByPlaceholder(PLACEHOLDER.questionCount)).toHaveCount(rows + 1);
}

export const QUESTION_TEXT = {
  first: 'What is the first step of active listening?',
  answer: 'Hear the whole question',
  explanation: 'You cannot answer what you have not heard.',
  trueFalse: 'Silence can be part of listening.'
};

/** The assessment the stubbed API returns: two questions, three points. */
export const OUTPUT = {
  status: 'success',
  direction: 'ltr',
  assessment: {
    assessmentTitle: 'Active Listening Check',
    direction: 'ltr',
    questions: [
      {
        questionNumber: 1,
        questionType: 'Multiple Choice',
        numberOfPoints: 2,
        points: [
          {
            pointNumber: 1,
            pointBody: QUESTION_TEXT.first,
            choices: ['Interrupt early', QUESTION_TEXT.answer, 'Answer fast'],
            pointAnswer: QUESTION_TEXT.answer,
            explanation: QUESTION_TEXT.explanation
          },
          {
            pointNumber: 2,
            pointBody: 'Which signal shows you are listening?',
            choices: ['Nodding', 'Checking your phone'],
            pointAnswer: 'Nodding',
            explanation: ''
          }
        ]
      },
      {
        questionNumber: 2,
        questionType: 'True/False',
        numberOfPoints: 1,
        points: [
          {
            pointNumber: 1,
            pointBody: QUESTION_TEXT.trueFalse,
            choices: ['True', 'False'],
            pointAnswer: 'True',
            explanation: 'Pauses give the speaker room.'
          }
        ]
      }
    ]
  }
};

/** The same assessment written in Arabic. */
export const OUTPUT_AR = {
  status: 'success',
  direction: 'rtl',
  assessment: { ...OUTPUT.assessment, assessmentTitle: 'اختبار الاستماع الفعال', direction: 'rtl' }
};
