import type { Screen } from 'e2e';
import type { Browser } from '@e2e-dev/web';

/**
 * The avatar dialog ("Create Video Avatar") every video route goes through:
 * a presenter from the library, then — unless the reader brought their own
 * audio — a voice, then Generate Video.
 *
 * Cards are `role="button"` divs named by their portrait or voice, and the
 * plan can lock some of them (Pro-only), so the first one the plan can use is
 * taken by class.
 */
export async function pickPresenterAndVoice(screen: Screen, browser: Browser, options: { voice?: boolean } = {}): Promise<void> {
  const dialog = screen.getByRole('dialog');
  await dialog.getByRole('button', 'Avatar Library').tap();
  await browser.locator('.vad-avatar-card:not(.is-locked)').first().tap();

  if (options.voice !== false) {
    await dialog.getByRole('button', /Next/).tap();
    await dialog.getByRole('button', 'Voice Library').tap();
    await browser.locator('.vad-voice-card:not(.is-locked)').first().tap();
  }

  await dialog.getByRole('button', /Generate Video/).tap();
}
