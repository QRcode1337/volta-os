#!/usr/bin/env node
// Daily trigger for the VOLTA Daily Briefing. Run by the LaunchAgent com.epsilon.volta-podcast at 06:00:
// asks the local VOLTA OS server to generate today's episode, then waits until the job finishes.
// The server does the work (research, script, voices, mastering); this script only starts it and reports.
//   node scripts/podcast-run.mjs [--date YYYY-MM-DD] [--force] [--fresh]
// Exit codes: 0 done (or already exists), 1 generation failed, 2 refused (storage/keys/cost), 3 server unreachable.

const BASE = process.env.VOLTA_BASE || 'http://127.0.0.1:50000';
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);

const log = (m) => console.log(`${new Date().toISOString()} [podcast-run] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON
  }
  return { status: res.status, json };
}

async function waitForServer() {
  // The Mac may just have woken from sleep and the dev server may still be starting.
  for (let i = 0; i < 40; i++) {
    try {
      const r = await call('/api/podcast/status');
      if (r.status === 200) return true;
    } catch {
      // not up yet
    }
    await sleep(15_000);
  }
  return false;
}

if (!(await waitForServer())) {
  log(`server at ${BASE} did not come up within 10 minutes`);
  process.exit(3);
}

// The dev server can be restarted by other work while an episode is being made (that kills the in-process job).
// Research results are cached per day, so starting again is cheap: allow up to 3 attempts.
let attempt = 0;
async function begin() {
  const start = await call('/api/podcast/generate', { scheduled: true, force: flag('force'), freshResearch: flag('fresh') && attempt === 0, date: opt('date') });
  if (start.status === 409 && /already exists/i.test(start.json?.error ?? '')) {
    log(`skipped: ${start.json.error}`);
    process.exit(0);
  }
  if (start.status !== 202 && !(start.status === 409 && /already being generated/i.test(start.json?.error ?? ''))) {
    log(`refused (${start.status}): ${start.json?.error ?? 'unknown error'}`);
    process.exit(2);
  }
  log(start.status === 202 ? `started job ${start.json.job.id} for ${start.json.job.date} (attempt ${attempt + 1})` : 'a job is already running; attaching to it');
}
await begin();

const deadline = Date.now() + 75 * 60_000;
let lastDetail = '';
while (Date.now() < deadline) {
  await sleep(20_000);
  let job;
  try {
    job = (await call('/api/podcast/job')).json?.job;
  } catch (e) {
    log(`poll failed: ${e.message}`);
    continue;
  }
  if (!job || (job.status === 'failed' && /^Interrupted/.test(job.error ?? ''))) {
    if (++attempt >= 3) {
      log('the server kept restarting; giving up');
      process.exit(1);
    }
    log('job was interrupted by a server restart; starting it again');
    if (!(await waitForServer())) process.exit(3);
    await begin();
    continue;
  }
  const line = `${job.stage ?? '-'}: ${job.detail}`;
  if (line !== lastDetail) log(line);
  lastDetail = line;
  if (job.status === 'done') {
    const ep = job.episode;
    log(`done: ${ep.title} (${ep.durationSec}s, audio $${ep.cost.ttsUsd.toFixed(3)}, research ${(ep.researchMs / 1000).toFixed(0)}s)`);
    for (const w of job.warnings) log(`warning: ${w}`);
    process.exit(0);
  }
  if (job.status === 'failed') {
    log(`failed: ${job.error}`);
    process.exit(1);
  }
}
log('gave up waiting after 75 minutes (the job may still be running)');
process.exit(1);
