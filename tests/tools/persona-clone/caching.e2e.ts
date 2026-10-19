import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { expectCacheOutcome } from '../../helpers/agent.ts';
import { clones, mockPersonaClone, PERSONA_CLONE_CONTEXT, PLACEHOLDER, ROUTE, SUBTAB, TAB } from './fixture.ts';

/**
 * The replay cache on this tool's screens. Its steps are tab changes and one
 * typed name — controls that look alike from tab to tab, so the checks after
 * each step are what tell a replay that landed on the right tab.
 *
 * Run the file twice: the first run misses (`no-entry`) and saves, the second
 * replays with no model calls. `npx e2e cache ls` lists the entries.
 */
describe(
  'clone yourself: replay cache',
  { tags: ['tools', 'persona-clone', 'agent', 'cache'], session: 'member', agentContext: PERSONA_CLONE_CONTEXT, timeout: 300_000 },
  () => {
    test('moving to My Voices replays', async ({ app, screen, browser, agent }) => {
      await mockPersonaClone(browser);
      await app.open(ROUTE);
      await expect(screen.getByPlaceholder(PLACEHOLDER.avatarName)).toBeVisible({ timeout: 20_000 });

      const step = await agent.act('open the My Voices tab');
      await expect(screen.getByRole('tab', TAB.voices)).toHaveAttribute('aria-selected', 'true');
      await expect(screen.getByPlaceholder(PLACEHOLDER.voiceName)).toBeVisible();
      expectCacheOutcome(step);
    });

    test('a typed avatar name with a run-unique value still replays', async ({ app, screen, browser, agent }) => {
      await mockPersonaClone(browser);
      await app.open(ROUTE);
      await expect(screen.getByPlaceholder(PLACEHOLDER.avatarName)).toBeVisible({ timeout: 20_000 });
      const name = `Cache Avatar ${Date.now()}`;

      const step = await agent.act('type {name} as the avatar name', { params: { name: unique(name) } });
      await expect(screen.getByPlaceholder(PLACEHOLDER.avatarName)).toHaveValue(name);
      expectCacheOutcome(step);
    });

    test('opening the avatar library replays, whatever the library holds', async ({ app, screen, browser, agent }) => {
      // A run-dependent count on the sub-tab's badge, so the replay cannot lean on it
      await mockPersonaClone(browser, { avatars: clones(1 + (Date.now() % 4)) });
      await app.open(ROUTE);
      await expect(screen.getByPlaceholder(PLACEHOLDER.avatarName)).toBeVisible({ timeout: 20_000 });

      const step = await agent.act('open my avatars library');
      await expect(screen.getByRole('tab', new RegExp(SUBTAB.avatarLibrary))).toHaveAttribute('aria-selected', 'true');
      await expect(screen.getByText('Clone 1', { exact: true })).toBeVisible();
      expectCacheOutcome(step);
    });
  }
);
