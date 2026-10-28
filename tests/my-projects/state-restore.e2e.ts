import { describe, test, type Browser } from '@e2e-dev/web';
import { expect, type JsonValue } from 'e2e';
import { mockSavedProject, mockVideoFile, mockVideoJob } from '../helpers/tool-api.ts';
import { INPUTS, OUTPUT, TOOL_ID as COURSE_CONTENT_TOOL_ID, TOOL_NAME as COURSE_CONTENT } from '../tools/full-course-content/fixture.ts';

/**
 * My Projects keeps its place across a visit to a project: the tab, the tool
 * filter, the search, the page and the scroll position all come back on Back,
 * whether that is the tool's Back button or the browser's.
 *
 * The list endpoints are stubbed so the pages hold known items; the tools
 * themselves, and the tool names in the filter, are the real ones.
 */

/** A second text tool, so filtering by Course Content Agent visibly narrows the list. */
const OTHER_TOOL_ID = 7;

/** 30 Course Content projects and 15 others: three pages of 20 unfiltered, two once filtered. */
const TEXT_PROJECTS = Array.from({ length: 45 }, (_, i) => ({
  projectId: 880_000 + i,
  projectName: i < 30 ? `Course module ${i + 1}` : `Other draft ${i - 29}`,
  latestProjectDetailId: 0,
  toolId: i < 30 ? COURSE_CONTENT_TOOL_ID : OTHER_TOOL_ID,
  createdAt: '2026-10-01T10:00:00Z'
}));

const VIDEO_JOBS = Array.from({ length: 25 }, (_, i) => ({
  jobId: 770_000 + i,
  name: `Avatar clip ${i + 1}`,
  createdAt: '2026-10-01T10:00:00Z',
  status: 'Failed',
  videoUrl: null
}));

function ok(data: unknown): JsonValue {
  return { succeeded: true, message: '', statusCode: 200, errorType: null, errors: null, data: data as JsonValue };
}

/** Pages `items` the way the API does, after narrowing them by `search` (and `toolId`, when sent). */
function page<T extends object>(url: string, items: T[], name: (item: T) => string): JsonValue {
  const params = new URL(url).searchParams;
  const pageNumber = Number(params.get('pageNumber') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 20);
  const search = (params.get('search') ?? '').toLowerCase();
  const toolId = params.get('toolId');

  const matching = items.filter(
    (item) => (!toolId || 'toolId' in item && item.toolId === Number(toolId)) && name(item).toLowerCase().includes(search)
  );
  const totalPages = Math.max(1, Math.ceil(matching.length / pageSize));
  return ok({
    items: matching.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
    pageNumber,
    pageSize,
    totalCount: matching.length,
    totalPages,
    hasPreviousPage: pageNumber > 1,
    hasNextPage: pageNumber < totalPages
  });
}

/** Stubs the text and avatar-video lists, and counts the text list's requests. */
async function mockLists(browser: Browser): Promise<{ textRequests: string[] }> {
  const textRequests: string[] = [];
  await browser.route('**/api/Projects/recent**', async (route) => {
    textRequests.push(route.request.url);
    await route.fulfill({ json: page(route.request.url, TEXT_PROJECTS, (p) => p.projectName) });
  });
  await mockVideoFile(browser);
  await browser.route('**/api/VideoGenerationTool/jobs/recent**', async (route) => {
    await route.fulfill({ json: page(route.request.url, VIDEO_JOBS, (j) => j.name) });
  });
  return { textRequests };
}

/** The element that scrolls the signed-in layout. */
const SCROLL_TOP = "document.querySelector('.mat-drawer-content').scrollTop";

describe('my projects: state survives a visit to a project', { tags: ['my-projects'], session: 'member', timeout: 180_000 }, () => {
  test('Avatar Videos stays selected, on its page, after opening a video and pressing Back', async ({ app, screen, browser }) => {
    const video = VIDEO_JOBS[22];
    await mockLists(browser);
    await mockVideoJob(browser, { id: video.jobId, status: 'Failed', name: video.name });
    await app.open('/my-projects');

    // Away and back again, so the tab is one the reader picked
    await screen.getByRole('tab', 'Text Creations').tap();
    await expect(browser).toHaveURL('/my-projects?tab=text');
    await screen.getByRole('tab', 'Avatar Videos').tap();
    await expect(browser).toHaveURL('/my-projects');
    await screen.getByRole('button', 'Next page').tap();
    await expect(browser).toHaveURL('/my-projects?page=2');

    await screen.getByText(video.name).tap();
    await expect(browser).toHaveURL(/\/tools\/video-ai-generator\//, { timeout: 20_000 });
    await screen.getByRole('button', 'Back').tap();

    await expect(browser).toHaveURL('/my-projects?page=2');
    await expect(screen.getByRole('tab', 'Avatar Videos')).toHaveAttribute('aria-selected', 'true');
    await expect(screen.getByRole('button', '2')).toHaveAttribute('aria-current', 'page');
    await expect(screen.getByText(video.name)).toBeVisible({ timeout: 20_000 });
  });

  test('Text Creations with Course Content Agent comes back with both selected', async ({ app, screen, browser }) => {
    await mockLists(browser);
    await mockSavedProject(browser, TEXT_PROJECTS[4].projectId, OUTPUT, INPUTS);
    await app.open('/my-projects');

    await screen.getByRole('tab', 'Text Creations').tap();
    await screen.getByRole('button', 'All tools').tap();
    await screen.getByRole('option', COURSE_CONTENT).tap();
    await expect(browser).toHaveURL(`/my-projects?tab=text&tool=${COURSE_CONTENT_TOOL_ID}`);
    await expect(screen.getByText('Other draft 1')).toHaveCount(0);

    await screen.getByText(TEXT_PROJECTS[4].projectName).tap();
    await expect(browser).toHaveURL(/\/tools\/full-course-content-tool\//, { timeout: 20_000 });
    await screen.getByRole('button', 'Back').tap();

    await expect(browser).toHaveURL(`/my-projects?tab=text&tool=${COURSE_CONTENT_TOOL_ID}`);
    await expect(screen.getByRole('tab', 'Text Creations')).toHaveAttribute('aria-selected', 'true');
    await expect(screen.getByRole('button', COURSE_CONTENT)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByText(TEXT_PROJECTS[4].projectName)).toBeVisible();
    await expect(screen.getByText('Other draft 1')).toHaveCount(0);
  });

  test('a search, a filter and a later page all come back, with the matching results', async ({ app, screen, browser }) => {
    await mockLists(browser);
    await mockSavedProject(browser, TEXT_PROJECTS[22].projectId, OUTPUT, INPUTS);
    await app.open('/my-projects?tab=text');

    await screen.getByRole('button', 'All tools').tap();
    await screen.getByRole('option', COURSE_CONTENT).tap();
    await screen.getByLabel('Search text creations').fill('module 2');
    // "module 2" and "module 20"–"module 29": eleven, so ten per page gives a second page
    await expect(browser).toHaveURL(/q=module(\+|%20)2/);
    await screen.getByRole('button', '10').tap();
    await screen.getByRole('button', '2').tap();
    await expect(screen.getByText('Course module 29')).toBeVisible();

    const listUrl = await browser.url();
    await screen.getByText('Course module 29').tap();
    await expect(browser).toHaveURL(/\/tools\/full-course-content-tool\//, { timeout: 20_000 });
    await browser.back();

    await expect(browser).toHaveURL(listUrl);
    await expect(screen.getByLabel('Search text creations')).toHaveValue('module 2');
    await expect(screen.getByRole('button', COURSE_CONTENT)).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByRole('button', '2')).toHaveAttribute('aria-current', 'page');
    await expect(screen.getByText('Course module 29')).toBeVisible();
    await expect(screen.getByText('Course module 2')).toHaveCount(0); // that one is on page 1
  });

  test('the scroll position down the list comes back', async ({ app, screen, browser }) => {
    await mockLists(browser);
    await mockSavedProject(browser, TEXT_PROJECTS[17].projectId, OUTPUT, INPUTS);
    await app.open('/my-projects?tab=text');
    await expect(screen.getByText('Course module 18')).toBeAttached({ timeout: 20_000 });

    await browser.evaluate(() => {
      const card = Array.from(document.querySelectorAll('.pr-doc')).find((el) => el.textContent?.includes('Course module 18'));
      card?.scrollIntoView({ block: 'center' });
      return null;
    });
    const before = await browser.evaluate<number>(SCROLL_TOP);
    expect(before).toBeGreaterThan(200);

    await screen.getByText('Course module 18').tap();
    await expect(browser).toHaveURL(/\/tools\/full-course-content-tool\//, { timeout: 20_000 });
    await screen.getByRole('button', 'Back').tap();

    await expect(browser).toHaveURL('/my-projects?tab=text');
    await expect.poll(() => browser.evaluate<number>(SCROLL_TOP), { timeout: 10_000 }).toBeCloseTo(before, -1);
  });

  test('browser Back and Forward keep the listing state consistent', async ({ app, screen, browser }) => {
    await mockLists(browser);
    await mockSavedProject(browser, TEXT_PROJECTS[0].projectId, OUTPUT, INPUTS);
    await app.open('/my-projects?tab=text');

    await screen.getByRole('button', 'Next page').tap();
    await expect(browser).toHaveURL('/my-projects?tab=text&page=2');
    await screen.getByRole('button', '1').tap();
    await expect(browser).toHaveURL('/my-projects?tab=text');
    // Refining the list replaces the entry rather than adding one, so one Back leaves My Projects
    await screen.getByText('Course module 1').tap();
    await expect(browser).toHaveURL(/\/tools\/full-course-content-tool\//, { timeout: 20_000 });

    await browser.back();
    await expect(browser).toHaveURL('/my-projects?tab=text');
    await expect(screen.getByRole('tab', 'Text Creations')).toHaveAttribute('aria-selected', 'true');

    await browser.forward();
    await expect(browser).toHaveURL(/\/tools\/full-course-content-tool\//, { timeout: 20_000 });

    await browser.back();
    await expect(browser).toHaveURL('/my-projects?tab=text');
    await expect(screen.getByRole('tab', 'Text Creations')).toHaveAttribute('aria-selected', 'true');
    await expect(screen.getByText('Course module 1')).toBeVisible();
  });

  test('returning asks only for the page that was showing', async ({ app, screen, browser }) => {
    const lists = await mockLists(browser);
    await mockSavedProject(browser, TEXT_PROJECTS[0].projectId, OUTPUT, INPUTS);
    await app.open('/my-projects?tab=text&page=2');
    await expect(screen.getByText('Course module 21')).toBeVisible({ timeout: 20_000 });

    await screen.getByText('Course module 21').tap();
    await expect(browser).toHaveURL(/\/tools\/full-course-content-tool\//, { timeout: 20_000 });
    const sent = lists.textRequests.length;

    await screen.getByRole('button', 'Back').tap();
    await expect(screen.getByText('Course module 21')).toBeVisible();
    // Every request on return is for page 2 — none for page 1 first
    expect(lists.textRequests.slice(sent).every((url) => url.includes('pageNumber=2'))).toBe(true);
  });

  test('a project opened straight from its URL still opens, and Back falls back', async ({ app, screen, browser }) => {
    await mockSavedProject(browser, TEXT_PROJECTS[0].projectId, OUTPUT, INPUTS);
    await app.open(`/tools/full-course-content-tool/${COURSE_CONTENT_TOOL_ID}?projectId=${TEXT_PROJECTS[0].projectId}`);
    await expect(screen.getByRole('heading', COURSE_CONTENT)).toBeVisible({ timeout: 20_000 });

    // Nothing of ours behind it, so Back goes to the tool's fallback rather than out of the site
    await screen.getByRole('button', 'Back').tap();
    await expect(browser).toHaveURL('/home');
  });
});
