import type { Screen } from 'e2e';

/**
 * Switches the site to Arabic from the language menu on the rail (the button
 * shows the current language's tag, "EN"). The tools refetch their questions
 * in the new language when this happens.
 */
export async function switchToArabic(screen: Screen): Promise<void> {
  await screen.getByRole('button', 'EN').tap();
  await screen.getByRole('menuitem', /العربية/).tap();
}
