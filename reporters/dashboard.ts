import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Reporter } from 'e2e';

/**
 * Streams a run's progress to the test dashboard (the Vercel app in this repo)
 * while it happens: the plan, each test starting, each step starting and
 * ending, each test's result, and — for a failed test — its trace page.
 *
 * Active only when the CI job sets DASHBOARD_URL, DASHBOARD_RUN_KEY and
 * DASHBOARD_INGEST_TOKEN; a local `npx e2e run` sends nothing.
 *
 * `onEvent` must never block or throw, so events are queued and a timer posts
 * them in batches, one request at a time, in order.
 */

type Json = Record<string, unknown>;

const FLUSH_MS = 1500;
const MAX_BATCH_BYTES = 400_000;
const MAX_TEXT = 4_000;
const MAX_TRACE = 60_000;

function clip(text: unknown, max = MAX_TEXT): string | undefined {
  if (typeof text !== 'string') return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function errorOf(error: unknown): Json | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as Json;
  return { code: e['code'], message: clip(e['message']) };
}

/** The events the dashboard draws, cut down to what it shows. Others return null. */
function compact(event: Json): Json | null {
  const base = { seq: event['seq'], at: event['at'] };
  switch (event['type']) {
    case 'run-started':
      return { ...base, type: 'run-started', model: event['model'] };
    case 'plan':
      return { ...base, type: 'plan', total: event['total'] };
    case 'notice':
      return { ...base, type: 'notice', message: clip(event['message']) };
    case 'setup': {
      const step = event['step'] as Json | undefined;
      return {
        ...base,
        type: 'setup',
        state: event['state'],
        label:
          step?.['label'] ??
          (step?.['kind'] === 'collect' ? 'Collect tests' : step?.['kind'] === 'prepare' ? `Prepare ${step['engine']}` : 'Setup'),
        durationMs: event['durationMs']
      };
    }
    case 'test-started':
      return { ...base, type: 'test-started', testId: event['testId'], title: event['title'], file: event['file'] };
    case 'step': {
      const p = event['progress'] as Json;
      if (p['phase'] !== 'start' && p['phase'] !== 'end') return null;
      const identity = p['identity'] as Json | undefined;
      return {
        ...base,
        type: 'step',
        testId: event['testId'],
        phase: p['phase'],
        stepId: identity?.['stepId'],
        attempt: identity?.['attemptIndex'] ?? 0,
        kind: p['kind'],
        api: p['api'],
        label: clip(p['label'], 600),
        status: p['status'],
        durationMs: p['durationMs'],
        modelCalls: p['modelCalls'],
        error: errorOf(p['error']),
        explanation: clip(p['explanation'])
      };
    }
    case 'test-finished': {
      // Live results carry the test under `test` (TestIdentity); the report flattens it.
      const r = event['result'] as Json;
      // The runner also reports every test the selection left out, as skipped: not part of this run.
      if (r['selected'] === false) return null;
      const test = (r['test'] as Json | undefined) ?? r;
      const attempts = (r['attempts'] as Json[] | undefined) ?? [];
      const last = attempts[attempts.length - 1];
      return {
        ...base,
        type: 'test-finished',
        testId: test['id'] ?? r['testId'],
        file: test['file'],
        titlePath: test['titlePath'],
        kind: test['kind'],
        status: r['status'],
        attempts: attempts.length,
        durationMs: attempts.reduce((sum, a) => sum + (Number(a['durationMs']) || 0), 0),
        error: errorOf(last?.['error'])
      };
    }
    case 'run-error':
      return { ...base, type: 'run-error', error: errorOf(event['error']) };
    case 'run-interrupted':
      return { ...base, type: 'run-interrupted', mode: event['mode'] };
    case 'run-stopped':
      return { ...base, type: 'run-stopped', failures: event['failures'], limit: event['limit'] };
    case 'run-finished':
      return { ...base, type: 'run-finished', status: event['status'], exitCode: event['exitCode'] };
    default:
      return null;
  }
}

function createDashboardReporter(): Reporter {
  let queue: Json[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let chain: Promise<void> = Promise.resolve();
  let failures = 0;
  let warned = false;

  const settings = () => {
    const url = process.env['DASHBOARD_URL'];
    const key = process.env['DASHBOARD_RUN_KEY'];
    const token = process.env['DASHBOARD_INGEST_TOKEN'];
    return url && key && token ? { url: url.replace(/\/+$/, ''), key, token } : null;
  };

  async function post(batch: Json[], signal?: AbortSignal): Promise<void> {
    const s = settings();
    if (!s) return;
    const response = await fetch(`${s.url}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ key: s.key, events: batch }),
      signal
    });
    if (!response.ok) throw new Error(`dashboard ingest answered ${response.status}`);
  }

  /** Posts everything queued, in batches under MAX_BATCH_BYTES, after any post already in flight. */
  function flush(signal?: AbortSignal): Promise<void> {
    chain = chain.then(async () => {
      while (queue.length) {
        const batch: Json[] = [];
        let bytes = 0;
        while (queue.length && (batch.length === 0 || bytes + JSON.stringify(queue[0]).length < MAX_BATCH_BYTES)) {
          const next = queue.shift()!;
          bytes += JSON.stringify(next).length;
          batch.push(next);
        }
        try {
          await post(batch, signal);
          failures = 0;
        } catch (error) {
          failures++;
          if (!warned) {
            warned = true;
            process.stderr.write(`dashboard reporter: ${(error as Error).message}\n`);
          }
          // Keep the batch for the next tick, unless the dashboard keeps refusing.
          if (failures < 5 && !signal?.aborted) queue = [...batch, ...queue];
          return;
        }
      }
    });
    return chain;
  }

  return {
    name: 'dashboard',
    onEvent(event) {
      if (!settings()) return;
      const compacted = compact(event as unknown as Json);
      if (!compacted) return;
      queue.push(compacted);
      if (!timer) {
        timer = setInterval(() => void flush(), FLUSH_MS);
        timer.unref();
      }
    },
    async onRunFinished(run, signal) {
      if (!settings()) return;
      if (timer) clearInterval(timer);

      // The trace page of each failed test: its steps, app log and the screen at failure.
      const results = (run.report as unknown as { run: { results: Json[]; summary: Json } }).run;
      for (const result of results.results) {
        if (result['status'] !== 'failed' && result['status'] !== 'timed-out') continue;
        const trace = run.traces.get(String(result['id']));
        if (!trace) continue;
        try {
          const text = readFileSync(path.resolve(run.projectRoot, trace), 'utf8');
          queue.push({ type: 'trace', testId: result['testId'], text: clip(text, MAX_TRACE) });
        } catch {
          // A trace that cannot be read is simply not shown.
        }
      }
      queue.push({ type: 'summary', summary: results.summary, status: run.status, exitCode: run.exitCode });

      await flush(signal);
      const s = settings();
      return s ? [{ label: 'Dashboard', text: `${s.url}/#run=${s.key}` }] : undefined;
    }
  };
}

export const dashboardReporter = createDashboardReporter();
