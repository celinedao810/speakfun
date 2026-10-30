"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

type PermissionState = 'unsupported' | 'needs-permission' | 'granted' | 'denied';

interface MotionEventWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * Detects a phone shake (several strong jolts within a second) and calls `onShake`.
 * On iOS, motion access must be granted from a tap first — call `enable()` from a button.
 */
export function useShake(onShake: () => void, active: boolean) {
  const [permission, setPermission] = useState<PermissionState>('unsupported');
  const onShakeRef = useRef(onShake);
  useEffect(() => { onShakeRef.current = onShake; }, [onShake]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;
    // Only touch devices can be shaken
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const needsPermission = typeof (DeviceMotionEvent as unknown as MotionEventWithPermission).requestPermission === 'function';
    setPermission(needsPermission ? 'needs-permission' : 'granted');
  }, []);

  const enable = useCallback(async () => {
    const req = (DeviceMotionEvent as unknown as MotionEventWithPermission).requestPermission;
    if (!req) { setPermission('granted'); return; }
    try {
      setPermission((await req()) === 'granted' ? 'granted' : 'denied');
    } catch {
      setPermission('denied');
    }
  }, []);

  useEffect(() => {
    if (!active || permission !== 'granted') return;
    let last: { x: number; y: number; z: number } | null = null;
    let jolts: number[] = [];
    let cooldownUntil = 0;

    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const cur = { x: a.x, y: a.y, z: a.z };
      if (last) {
        const delta = Math.abs(cur.x - last.x) + Math.abs(cur.y - last.y) + Math.abs(cur.z - last.z);
        const now = Date.now();
        if (delta > 25 && now > cooldownUntil) {
          jolts = [...jolts.filter(t => now - t < 1000), now];
          if (jolts.length >= 3) {
            jolts = [];
            cooldownUntil = now + 2500;
            onShakeRef.current();
          }
        }
      }
      last = cur;
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [active, permission]);

  return { permission, enable };
}
