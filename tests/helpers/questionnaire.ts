import type { Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';

/**
 * The text tools ask their inputs one question at a time
 * (`app-tool-questionnaire`). Only the live question shows its control, so a
 * plain query never meets an answered one — answered questions collapse to
 * their answer and an Edit button.
 *
 * - text / textarea / number: typed, then Continue
 * - dropdown: one button per option, named "<letter> <label>" ("A English");
 *   picking one advances by itself
 * - age range: a rail of "<n> years" chips, two taps, then Continue
 * - optional questions carry Skip; the last question carries Generate
 */
export type Answer =
  | { placeholder: string | RegExp; value: string }
  | { choose: string }
  | { ages: [number, number] }
  | { press: RegExp } // a plain button in the question (a duration pill), then Continue
  | 'skip'
  | 'continue'; // a toggle left as it is

/** The option button for `label`, whatever letter badge precedes it. */
export function option(screen: Screen, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return screen.getByRole('button', new RegExp(`^[A-Z] ${escaped}$`));
}

/** A chip on the age rail; its name grows a hint once it anchors a range. */
export function ageChip(screen: Screen, age: number) {
  return screen.getByRole('button', new RegExp(`^${age} years`));
}

/** The "answered / total" counter above the questions. */
export function progress(screen: Screen, answered: number, total: number) {
  return screen.getByText(`${answered} / ${total}`);
}

export async function answer(screen: Screen, a: Answer): Promise<void> {
  if (a === 'skip') {
    await screen.getByRole('button', 'Skip').tap();
    return;
  }
  if (a === 'continue') {
    await screen.getByRole('button', 'Continue').tap();
    return;
  }
  if ('choose' in a) {
    const choice = option(screen, a.choose);
    // Long lists (a dialect, say) show six options until "View more" is pressed.
    if (!(await choice.isVisible())) {
      await screen.getByRole('button', 'View more').tap();
    }
    await choice.tap();
    return;
  }
  if ('ages' in a) {
    await ageChip(screen, a.ages[0]).tap();
    await ageChip(screen, a.ages[1]).tap();
    await expect(screen.getByText(`${a.ages[0]} – ${a.ages[1]}`)).toBeVisible();
    await screen.getByRole('button', 'Continue').tap();
    return;
  }
  if ('press' in a) {
    await screen.getByRole('button', a.press).tap();
    await screen.getByRole('button', 'Continue').tap();
    return;
  }
  await screen.getByPlaceholder(a.placeholder).fill(a.value);
  await screen.getByRole('button', 'Continue').tap();
}

/** The text every question the walker types into gets. */
export const WALK_TEXT = 'E2E answer';

/**
 * Answers whatever question is open, one after another, until the last one —
 * the one carrying Generate — is open; returns how many it answered.
 *
 * For checks that only need to get through a tool's questions, whatever they
 * are: text gets `WALK_TEXT`, numbers 10, choices their first option, the age
 * range 20–30, files and other optional uploads are skipped, toggles and
 * sliders keep their default, an assessment's question mix gets one row.
 * Reads the open panel by class: the controls have no names to tell one
 * question's from another's.
 */
export async function walkToLastQuestion(screen: Screen, browser: Browser): Promise<number> {
  const live = 'section.q-panel:not(.is-answered)';
  const has = async (selector: string) => (await browser.locator(`${live} ${selector}`).count()) > 0;
  const counter = browser.locator('.q-progress__label');

  for (let step = 0; step < 30; step++) {
    if (await has('.q-generate-btn')) {
      return step;
    }
    const answered = Number(((await counter.textContent()) ?? '').split('/')[0].trim());

    // The assessment tools' question mix: a step of its own after Language,
    // outside the question panels, that holds the flow until it has a row
    if ((await browser.locator('.aq-add').count()) > 0 && (await browser.locator('.aq-row').count()) === 0) {
      await browser.locator('.aq-add').tap();
    } else if (await has('.agr__rail')) {
      await ageChip(screen, 20).tap();
      await ageChip(screen, 30).tap();
      await screen.getByRole('button', 'Continue').tap();
    } else if (await has('.q-option')) {
      await browser.locator(`${live} .q-option`).first().tap();
    } else if (await has('input[type="file"]')) {
      await screen.getByRole('button', 'Skip').tap();
    } else if ((await has('input[type="checkbox"]')) || (await has('input[type="range"]'))) {
      await screen.getByRole('button', 'Continue').tap();
    } else if (await has('input[type="number"]')) {
      await browser.locator(`${live} input[type="number"]`).fill('10');
      await screen.getByRole('button', 'Continue').tap();
    } else {
      await browser.locator(`${live} input[type="text"], ${live} textarea`).first().fill(WALK_TEXT);
      await screen.getByRole('button', 'Continue').tap();
    }

    await expect(counter).toHaveText(new RegExp(`^${answered + 1} / \\d+$`));
  }
  throw new Error('The questionnaire never reached its last question');
}

/**
 * Walks the answers in order, checking the counter moves after each one, so a
 * question that silently refused its answer fails here and not three steps on.
 *
 * Stops short of the last question: that one carries Generate, and how the run
 * is started (Generate, Skip, the agent) is the test's to decide. `answered` is
 * the counter's value before the first answer, for a walk that resumes mid-flow.
 */
export async function answerAll(screen: Screen, answers: Answer[], total: number, answered = 0): Promise<void> {
  for (let i = 0; i < answers.length; i++) {
    await answer(screen, answers[i]);
    await expect(progress(screen, answered + i + 1, total)).toBeVisible();
  }
}
