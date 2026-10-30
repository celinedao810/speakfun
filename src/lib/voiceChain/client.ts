/** Fetch helper for /api/voice-chain/* — throws with the route's error message on non-OK responses. */
export async function vcFetch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/voice-chain/${path}`, body === undefined
    ? undefined
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export async function vcPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/voice-chain/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** "2nd in its chain", "3rd in its chain"…; empty for a chain starter (position 1). */
export function chainLabel(position: number): string {
  if (position <= 1) return '';
  const tens = position % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[position % 10] ?? 'th';
  return `${position}${suffix} in its chain`;
}

export function formatSeconds(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m}m ${rest}s` : `${m}m`;
}
