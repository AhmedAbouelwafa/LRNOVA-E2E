import type { ActResult } from 'e2e';
import { expect } from 'e2e';

/**
 * Vocabulary every text tool's screens use, handed to the agent as
 * `agentContext`. It is part of the replay cache's key, so editing it makes
 * every tool step record afresh on its next run.
 */
export const TOOL_CONTEXT = [
  'This is a text-generation tool in the LRNOVA dashboard.',
  'Before a result exists the page asks its inputs one question at a time, under a "Question n/total" pill and an "answered / total" counter.',
  'Each choice is a button whose name starts with a letter badge, e.g. "A English"; picking one moves straight to the next question.',
  'A typed answer is confirmed with the Continue button. An optional question has a Skip button. The last question has the Generate button.',
  'The age range is a row of "<n> years" chips: tap one end, tap the other end, then Continue.',
  'An answered question collapses to its answer with an Edit button.',
  'After generating, the result document sits in a canvas whose toolbar has New Project, Copy all content, Export and Edit.',
  'Below the inputs there is a "Add feedback to refine result ..." box with a Refine Output button.'
].join(' ');

/**
 * What the replay cache did for one `agent.act`, checked against the rules it
 * promises, whichever way this run went:
 *
 * - replayed (`self-finalized`): every recorded action ran and no model call was made
 * - handed off (`agent-concluded`): replay started, then the agent finished the step
 * - missed: the agent ran from the start, and the report says why (`no-entry` on a first run)
 *
 * The first run of a step is a miss that records; the next run replays it. With
 * `--no-cache` the step carries no cache object and there is nothing to check.
 */
export function expectCacheOutcome(result: ActResult): void {
  const cache = result.cache;
  if (!cache) return;

  expect(['self-finalized', 'agent-concluded', 'missed']).toContain(cache.mode);

  if (cache.mode === 'self-finalized') {
    expect(result.modelCalls).toBe(0);
    expect(cache.replayedActions).toBe(cache.totalActions);
  } else {
    expect(cache.reason).toBeDefined();
    expect(result.modelCalls).toBeGreaterThan(0);
  }
}
