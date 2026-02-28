import { createClient } from '@supabase/supabase-js';
import { generateWindowForClass } from './generateWindow';

async function runGeneration(version: number) {
  // Self-destruct if this instance has been superseded by a newer module load
  if ((global.__schedulerVersion as number) !== version) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[homework-scheduler] Missing Supabase env vars — skipping');
    return;
  }

  const supabase = createClient(url, key);

  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('class_id');

  const classIds = [...new Set((enrollments ?? []).map((e: { class_id: string }) => e.class_id))];
  if (classIds.length === 0) return;

  for (const classId of classIds) {
    try {
      const result = await generateWindowForClass(supabase, classId);
      if (result.created) {
        console.log(
          `[homework-scheduler] Created window for class ${classId} — session #${result.window?.sessionNumber}`
        );
      }
    } catch (err) {
      console.error(`[homework-scheduler] Error for class ${classId}:`, err);
    }
  }
}

// ─── HMR / restart safety ────────────────────────────────────────────────────
// Globals survive across HMR module re-evaluations.
// The version token ensures old runGeneration closures self-destruct on the
// next poll when they detect they've been superseded by a newer module load.
declare global {
  // eslint-disable-next-line no-var
  var __schedulerVersion: number;
  // eslint-disable-next-line no-var
  var __homeworkSchedulerInterval: ReturnType<typeof setInterval> | null;
  // eslint-disable-next-line no-var
  var __homeworkSchedulerStartup: ReturnType<typeof setTimeout> | null;
}

// Increment on every module load (server start or HMR reload)
global.__schedulerVersion = (global.__schedulerVersion ?? 0) + 1;
const myVersion = global.__schedulerVersion;
// ─────────────────────────────────────────────────────────────────────────────

export function scheduleHomeworkGeneration() {
  // Cancel timers that were tracked by the previous module instance
  if (global.__homeworkSchedulerInterval) {
    clearInterval(global.__homeworkSchedulerInterval);
    global.__homeworkSchedulerInterval = null;
  }
  if (global.__homeworkSchedulerStartup) {
    clearTimeout(global.__homeworkSchedulerStartup);
    global.__homeworkSchedulerStartup = null;
  }

  const intervalMins = parseInt(process.env.HOMEWORK_SESSION_DURATION_MINS || '0', 10);
  // Test/staging: use the session duration as the poll interval so new sessions fire right on expiry.
  // Production (no duration set): poll every hour — the daily window expires at midnight UTC+7,
  // and a new one will be created within the next poll cycle.
  const intervalMs = intervalMins > 0 ? intervalMins * 60 * 1000 : 60 * 60 * 1000;

  console.log(`[homework-scheduler] Started v${myVersion} — poll interval: ${intervalMs / 60000} min`);

  global.__homeworkSchedulerStartup = setTimeout(() => {
    global.__homeworkSchedulerStartup = null;
    runGeneration(myVersion);
    global.__homeworkSchedulerInterval = setInterval(() => runGeneration(myVersion), intervalMs);
  }, 10_000);
}
