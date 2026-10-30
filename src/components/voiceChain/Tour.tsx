"use client";

import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { primaryBtn, secondaryBtn } from './shared';

export interface TourStep {
  /** `data-tour` value of the element to highlight; omitted → centred card. */
  target?: string;
  title: string;
  body: React.ReactNode;
  icon?: LucideIcon;
}

interface TourProps {
  steps: TourStep[];
  startAt?: number;
  onClose: (finished: boolean) => void;
}

interface Box { top: number; left: number; width: number; height: number }

const PAD = 8;
const GAP = 14;
const MARGIN = 16;

/** Spotlight tour: dims the page, highlights the step's element and points a card at it. */
export default function Tour({ steps, startAt = 0, onClose }: TourProps) {
  const [index, setIndex] = useState(Math.min(Math.max(startAt, 0), steps.length - 1));
  const [box, setBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step.target]);

  // Bring the target into view, then measure once scrolling has settled
  useLayoutEffect(() => {
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    measure();
    const t1 = window.setTimeout(measure, 250);
    const t2 = window.setTimeout(measure, 600);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [step.target, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
      if (e.key === 'ArrowRight') setIndex(i => Math.min(i + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, steps.length]);

  // Card placement: below the target if there's room, otherwise above; centred without a target
  const cardWidth = Math.min(360, Math.max(0, viewport.w - MARGIN * 2));
  let cardStyle: React.CSSProperties = { width: cardWidth };
  let arrow: { side: 'top' | 'bottom'; x: number } | null = null;
  if (box && viewport.w) {
    const centerX = box.left + box.width / 2;
    const left = Math.min(Math.max(centerX - cardWidth / 2, MARGIN), viewport.w - cardWidth - MARGIN);
    const below = viewport.h - (box.top + box.height) > 240 || box.top < 240;
    cardStyle = below
      ? { ...cardStyle, left, top: Math.min(box.top + box.height + GAP, viewport.h - 200) }
      : { ...cardStyle, left, bottom: viewport.h - box.top + GAP };
    arrow = { side: below ? 'top' : 'bottom', x: Math.min(Math.max(centerX - left, 20), cardWidth - 20) };
  }

  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Tour: ${step.title}`}>
      {/* Dimmer: a spotlight cut-out around the target, or a plain backdrop */}
      {box ? (
        <div
          className="absolute rounded-xl pointer-events-none transition-all duration-300 ring-2 ring-primary"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}
      {/* Blocks the page underneath while the tour is open */}
      <div className="absolute inset-0" onClick={e => e.stopPropagation()} />

      <div
        key={index}
        className={`vc-fade-up absolute rounded-2xl bg-card border border-border shadow-xl px-5 py-4 ${box ? '' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'}`}
        style={cardStyle}
      >
        {arrow && (
          <span
            aria-hidden
            className={`absolute w-3.5 h-3.5 rotate-45 bg-card border-border ${arrow.side === 'top' ? '-top-[7px] border-l border-t' : '-bottom-[7px] border-r border-b'}`}
            style={{ left: arrow.x - 7 }}
          />
        )}
        <button type="button" onClick={() => onClose(false)} aria-label="Close tour"
          className="absolute right-3 top-3 p-1 rounded-md text-muted-foreground hover:bg-muted">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 pr-6">
          {Icon && (
            <span className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </span>
          )}
          <p className="text-base font-semibold text-foreground">{step.title}</p>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">{step.body}</div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex gap-1" aria-label={`Step ${index + 1} of ${steps.length}`}>
            {steps.map((_, i) => (
              <button key={i} type="button" onClick={() => setIndex(i)} aria-label={`Go to step ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`} />
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            {index > 0 && (
              <button type="button" className={`${secondaryBtn} px-3 py-1.5`} onClick={() => setIndex(i => i - 1)}>Back</button>
            )}
            <button type="button" className={`${primaryBtn} px-3 py-1.5`} autoFocus
              onClick={() => (last ? onClose(true) : setIndex(i => i + 1))}>
              {last ? 'Let’s talk!' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
