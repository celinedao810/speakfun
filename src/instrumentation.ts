/**
 * Next.js Instrumentation — runs once when the server process starts.
 * Used to kick off the background homework-window scheduler.
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run in the Node.js runtime (not Edge), and only on the server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { scheduleHomeworkGeneration } = await import('./lib/homework/scheduler');
    scheduleHomeworkGeneration();
  }
}
