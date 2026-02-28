'use client'

import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // Bypass navigator.locks to prevent AbortError from React Strict Mode
      // double-invoked effects. Safe because createBrowserClient is a singleton.
      lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
        return await fn();
      },
    },
  }
)

// Monkey-patch _acquireLock to fix deadlock in @supabase/auth-js@2.95.3.
// The default implementation has a pendingInLock drain loop that can deadlock
// when concurrent auth operations (auto-refresh, visibility change, React
// Strict Mode double effects) queue up while the lock is held.
// This replaces it with a simple promise-chain mutex: operations are serialized
// but there's no drain loop that can cause circular waits.
{
  const auth = supabase.auth as unknown as {
    _acquireLock: (timeout: number, fn: () => Promise<unknown>) => Promise<unknown>;
  };
  let chainTail = Promise.resolve() as Promise<unknown>;

  auth._acquireLock = async (_acquireTimeout: number, fn: () => Promise<unknown>) => {
    const prev = chainTail;
    let resolve: () => void;
    chainTail = new Promise<void>(r => { resolve = r; });

    try {
      await prev;
      // Timeout fn() so a hanging token-refresh network call (e.g. after tab switch
      // or near token expiry) never permanently stalls the entire lock chain.
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('auth-lock-fn-timeout')), 10_000)
        ),
      ]);
    } finally {
      resolve!();
    }
  };
}
