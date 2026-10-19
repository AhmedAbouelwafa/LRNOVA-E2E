import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mockToolFailure, mockToolHttpFailure } from '../../helpers/tool-api.ts';
import { walkToLastQuestion, WALK_TEXT } from '../../helpers/questionnaire.ts';
import { switchToArabic } from '../../helpers/language.ts';

/**
 * The shared intake behaviour, on every tool built on the questionnaire:
 *
 * - a refused run shows why (`app-tool-error-message`) and reopens the
 *   questions on the last one, Generate in reach (`resumeAtEnd`)
 * - a language switch keeps every answer and the place
 *   (`ToolService.retranslate` + the questionnaire's relabel)
 *
 * Each tool's own folder covers the rest of its behaviour; this file is the
 * guarantee the shared pieces hold everywhere they are used. `name` is the
 * heading the API gives the tool, checked where the heading is the tool's.
 */
const TOOLS: { route: string; endpoint: string; label: string; name?: string; nameAr?: string; pick?: string }[] = [
  { route: '/tools/full-course-script-tool/1', endpoint: 'FullCourseScriptTool', label: 'Course Script Agent', name: 'Course Script Agent', nameAr: 'مولد دورات الفيديو' },
  { route: '/tools/single-video-script-tool/2', endpoint: 'SingleVideoScriptTool', label: 'Video Script Agent', name: 'Video Script Agent', nameAr: 'مولد نصوص الفيديوهات' },
  { route: '/tools/assessment-tool/3', endpoint: 'AssessmentTool', label: 'Assessment Agent' },
  { route: '/tools/topic-generator-tool/6', endpoint: 'TopicGeneratorTool', label: 'Lesson Agent', name: 'Lesson Agent', nameAr: 'مولد الدروس التعليمية' },
  { route: '/tools/activity-generator-tool/7', endpoint: 'ActivityGeneratorTool', label: 'Activity Agent', name: 'Activity Agent', nameAr: 'منشئ الانشطة والتدريبات العملية' },
  { route: '/tools/full-course-content-tool/9', endpoint: 'FullCourseContentTool', label: 'Course Content Agent', name: 'Course Content Agent', nameAr: 'مولد الدورات التدريبية' },
  // Gaming is entered through its game picker, which hands it the game type it never asks for
  { route: '/agent/game-selector', pick: 'Check Understanding', endpoint: 'GamingAgent', label: 'Gaming Agent' },
  { route: '/tools/homework-agent', endpoint: 'AssessmentTool', label: 'Homework Agent' }
];

for (const tool of TOOLS) {
  describe(`${tool.label}: shared intake`, { tags: ['tools', 'shared-intake'], session: 'member', timeout: 180_000 }, () => {
    test('a refused run says why and keeps Generate in reach', async ({ app, screen, browser }) => {
      await mockToolFailure(browser, tool.endpoint, { message: 'The model is busy, try again.' });
      await app.open(tool.route);
      if (tool.pick) {
        await screen.getByText(tool.pick).tap();
      }
      if (tool.name) {
        await expect(screen.getByRole('heading', tool.name)).toBeVisible({ timeout: 20_000 });
      }
      await expect(browser.locator('.q-progress__label')).toBeVisible({ timeout: 20_000 });

      const answered = await walkToLastQuestion(screen, browser);
      await screen.getByRole('button', 'Generate').tap();

      await expect(screen.getByRole('alert')).toContainText('The model is busy, try again.', { timeout: 20_000 });
      await expect(screen.getByText(new RegExp(`^${answered} / \\d+$`))).toBeVisible();
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    // A failure at the HTTP level (an outage, a crashed backend) ends the
    // request with an error, not a response. The page used to clear its loader
    // only when a request completed, so it spun for good — and the message, in
    // Angular's words, sat behind it.
    test('a request that fails outright says so and gives the questions back', async ({ app, screen, browser }) => {
      await mockToolHttpFailure(browser, tool.endpoint);
      await app.open(tool.route);
      if (tool.pick) {
        await screen.getByText(tool.pick).tap();
      }
      await expect(browser.locator('.q-progress__label')).toBeVisible({ timeout: 20_000 });

      await walkToLastQuestion(screen, browser);
      await screen.getByRole('button', 'Generate').tap();

      await expect(screen.getByRole('alert')).toContainText('Something went wrong. Please try again.', {
        timeout: 20_000
      });
      await expect(browser.locator('app-content-loader')).toHaveCount(0);
      await expect(screen.getByRole('button', 'Generate')).toBeEnabled();
    });

    // A refusal that carries no message of its own gets the page's fallback,
    // which is translated — not an English sentence on an Arabic page.
    test('a refusal with no message of its own is explained in Arabic on the Arabic site', async ({ app, screen, browser }) => {
      await mockToolFailure(browser, tool.endpoint, { message: '' });
      await app.open(tool.route);
      if (tool.pick) {
        await screen.getByText(tool.pick).tap();
      }
      await expect(browser.locator('.q-progress__label')).toBeVisible({ timeout: 20_000 });

      await walkToLastQuestion(screen, browser);
      await switchToArabic(screen);
      await screen.getByRole('button', 'إنشاء').tap();

      await expect(screen.getByRole('alert')).toContainText('تعذّر الإنشاء. حاول مرة أخرى.', { timeout: 20_000 });
    });

    test('switching the site to Arabic keeps the answers and the place', async ({ app, screen, browser }) => {
      await app.open(tool.route);
      if (tool.pick) {
        await screen.getByText(tool.pick).tap();
      }
      await expect(browser.locator('.q-progress__label')).toBeVisible({ timeout: 20_000 });

      const answered = await walkToLastQuestion(screen, browser);
      await switchToArabic(screen);

      if (tool.nameAr) {
        await expect(screen.getByRole('heading', tool.nameAr)).toBeVisible({ timeout: 20_000 });
      }
      // Still on the last question — Generate, now in Arabic — with every answer
      await expect(screen.getByRole('button', 'إنشاء')).toBeVisible({ timeout: 20_000 });
      await expect(screen.getByText(new RegExp(`^${answered} / \\d+$`))).toBeVisible();
      await expect(screen.getByText(WALK_TEXT).first()).toBeVisible();
    });
  });
}
