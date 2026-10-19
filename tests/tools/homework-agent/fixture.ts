/**
 * Homework Agent — homework sets, on the Assessment Agent's machinery.
 *
 * The same static questions as the Assessment Agent (its question keys, its
 * question mix after Language) and the same backend: runs go to
 * `AssessmentTool` under the Assessment tool's id, and come back as an
 * assessment. What differs is the page around them — its own route, title and
 * result layout — so the answers and the stubbed output are the Assessment
 * fixture's, re-exported.
 */
export {
  addQuestionRow,
  ANSWERS_AFTER_MIX,
  ANSWERS_TO_MIX,
  INPUTS,
  OUTPUT,
  OUTPUT_AR,
  PLACEHOLDER,
  QUESTION_TEXT,
  QUIZ,
  TOTAL
} from '../assessment/fixture.ts';

export const ROUTE = '/tools/homework-agent';
export const ENDPOINT = 'AssessmentTool';
/** Runs are sent under the Assessment tool's id: Homework has none of its own. */
export const TOOL_ID = 3;
export const TOOL_NAME = 'Homework Agent';
export const TOOL_NAME_AR = 'منشئ الواجبات المدرسية';
export const DEFAULT_TITLE = `Untitled - ${TOOL_NAME}`;

/** The question mix is the eighth step; its rows hold the flow until there is one. */
export const MIX_STEP = 8;
