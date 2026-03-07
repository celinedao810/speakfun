/**
 * Next.js Instrumentation — runs once when the server process starts.
 * Used to kick off the background homework-window scheduler.
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run the in-process scheduler in development.
  // In production, the Vercel cron job (23:00 UTC / 6am UTC+7) handles daily generation.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV !== 'production') {
    const { scheduleHomeworkGeneration } = await import('./lib/homework/scheduler');
    scheduleHomeworkGeneration();
  }
}
