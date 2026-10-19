import type { App, Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { walkToLastQuestion } from '../../helpers/questionnaire.ts';

/**
 * Gaming Agent — learning games, quiz or discussion cards.
 *
 * Entered from a game picker (`/agent/game-selector`) that asks the game type
 * and hands it over in the navigation state, so the questionnaire does not ask
 * it again. The finished game opens in a set-up view (every question, editable)
 * with Start Game to play it.
 */
export const PICKER = '/agent/game-selector';
export const TOOL_ID = 12;
export const ROUTE = `/agent/gaming-agent/${TOOL_ID}`;
export const ENDPOINT = 'GamingAgent';

export const MODE = {
  quiz: 'Check Understanding',
  discussion: 'Start a Class Discussion'
};

export const NOTES_PLACEHOLDER = 'Add a note to refine the result...';

export const QUIZ_TEXT = {
  title: 'Listening Quiz',
  question: 'What comes before the answer?',
  right: 'Hearing the whole question',
  wrong: 'Interrupting',
  explanation: 'You cannot answer what you have not heard.'
};

export const QUIZ_OUTPUT = {
  gameType: 'quiz',
  direction: 'ltr',
  maxAttempts: 3,
  timeLimitSeconds: 120,
  quiz: {
    gameTitle: QUIZ_TEXT.title,
    numberOfLevels: 1,
    levels: [
      {
        levelNumber: 1,
        levelTitle: 'Basics',
        questions: [
          {
            id: 'q1',
            questionText: QUIZ_TEXT.question,
            options: [
              { id: 'a', text: QUIZ_TEXT.right, isCorrect: true },
              { id: 'b', text: QUIZ_TEXT.wrong, isCorrect: false }
            ],
            correctAnswer: 'a',
            explanation: QUIZ_TEXT.explanation,
            hint: 'Think about listening.'
          }
        ]
      }
    ]
  }
};

export const CARD_TEXT = {
  title: 'Listening Talk',
  question: 'When did someone really listen to you?',
  answer: 'Share the moment, and what they did that showed it.',
  question2: 'What makes you stop listening?'
};

export const DISCUSSION_OUTPUT = {
  gameType: 'discussion_cards',
  direction: 'ltr',
  discussion: {
    gameTitle: CARD_TEXT.title,
    numberOfLevels: 1,
    levels: [
      {
        levelNumber: 1,
        levelTitle: 'Warm up',
        cards: [
          { id: '0_1', question: CARD_TEXT.question, answer: CARD_TEXT.answer },
          { id: '0_2', question: CARD_TEXT.question2, answer: 'Name it, then put it away.' }
        ]
      }
    ]
  }
};

/** What `walkToLastQuestion` answers send for a quiz picked in the picker. */
export const WALKED_INPUTS = {
  topic: 'E2E answer',
  gameType: 'quiz',
  ageMin: '20',
  ageMax: '30',
  language: 'English',
  numberOfLevels: 3,
  itemsPerLevel: 5,
  timeLimitSeconds: 120,
  maxAttempts: 3
};

/** Picks a game in the picker and lands on its questions. */
export async function fromPicker(app: App, screen: Screen, browser: Browser, mode: string): Promise<void> {
  await app.open(PICKER);
  await screen.getByText(mode).tap();
  await expect(browser).toHaveURL(ROUTE);
}

/** Picks a game, answers every question and generates it against the stubbed API. */
export async function generateGame(app: App, screen: Screen, browser: Browser, mode: string, title: string): Promise<void> {
  await fromPicker(app, screen, browser, mode);
  await walkToLastQuestion(screen, browser);
  await screen.getByRole('button', 'Generate').tap();
  // The set-up view heads the game with its title and the level's: "Title — Level"
  await expect(screen.getByRole('heading', new RegExp(`^${title}`))).toBeVisible({ timeout: 20_000 });
}
