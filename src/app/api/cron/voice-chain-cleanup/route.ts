import { NextRequest, NextResponse } from 'next/server';
import { purgeExpired, serviceClient } from '@/lib/voiceChain/server';

/**
 * GET /api/cron/voice-chain-cleanup
 *
 * Called daily by Vercel Cron Jobs (see vercel.json). Deletes Voice Chain
 * recordings older than 24h and clears their transcript/feedback; time and
 * scores stay for stats. Expired messages are never served in between runs,
 * and /api/voice-chain/status also purges a few on each call.
 *
 * Protected by CRON_SECRET environment variable.
 * Locally: curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/voice-chain-cleanup
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = serviceClient();
  let purged = 0;
  try {
    // Batches of 200 until nothing is left (bounded so one run can't loop forever)
    for (let i = 0; i < 25; i++) {
      const n = await purgeExpired(svc, 200);
      purged += n;
      if (n < 200) break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/voice-chain-cleanup] Error:', message);
    return NextResponse.json({ error: message, purged }, { status: 500 });
  }

  console.log(`[cron/voice-chain-cleanup] Purged ${purged} recording(s)`);
  return NextResponse.json({ purged });
}
