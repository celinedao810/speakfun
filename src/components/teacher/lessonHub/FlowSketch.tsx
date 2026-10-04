"use client";

import React, { useEffect, useRef, useState } from 'react';
import type { Flow, FlowBlock, FlowStep } from '@/lib/lessonHub/types';

/* A topic may carry `flow`: steps of a user journey, each a page and/or a pop-up window
   built from simple wireframe blocks. The sketch plays like a clickable prototype: the
   cursor moves to the block marked `click`, presses it, and the next step appears.
   The stage is drawn imperatively (as in the original hub) so the cursor can measure
   the real position of the block it is about to press. */

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function fBlock(b: FlowBlock | string, projectName: string): string {
  if (typeof b === 'string') return esc(b);
  const c = b.click ? ' data-fclick="1"' : '';
  switch (b.t) {
    case 'logo': return `<div class="flogo"><b>${esc((projectName || 'S')[0])}</b>${esc(b.text || projectName || '')}</div>`;
    case 'h': return `<div class="fh">${esc(b.text)}</div>`;
    case 'p': return `<div class="fp">${esc(b.text)}</div>`;
    case 'input': return `<div class="finput">${esc(b.text)}</div>`;
    case 'btn': return `<div class="fbtn${b.primary ? ' pri' : ''}"${c}>${b.icon ? `<span class="fic">${esc(b.icon)}</span>` : ''}${esc(b.text)}</div>`;
    case 'link': return `<div class="flink"${c}>${esc(b.text)}</div>`;
    case 'or': return `<div class="for">or</div>`;
    case 'acct': return `<div class="facct"${c}><i></i><div>${esc(b.text)}${b.sub ? `<small>${esc(b.sub)}</small>` : ''}</div></div>`;
    case 'list': return `<ul class="flist">${(b.items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    case 'row': return `<div class="frow">${(b.items || []).map(x => fBlock(x, projectName)).join('')}</div>`;
    case 'spin': return `<div class="fspin"><i></i>${esc(b.text || '')}</div>`;
    case 'cards': return `<div class="fcards">${(b.items || []).map(x => `<span>${esc(x)}</span>`).join('')}</div>`;
  }
  return '';
}

// A pop-up step with no page of its own sits over the last page shown.
function resolve(steps: FlowStep[], i: number) {
  let page: FlowBlock[] | null = null, url: string | null = null;
  for (let k = i; k >= 0 && (!page || !url); k--) {
    if (!page && steps[k].page) page = steps[k].page!;
    if (!url && steps[k].url) url = steps[k].url!;
  }
  return { page: page || [], url: url || '' };
}

export default function FlowSketch({ flow, projectName }: { flow: Flow; projectName: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const n = flow.steps.length;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)); };
    const steps = flow.steps;
    const st = steps[i], r = resolve(steps, i);

    const url = el.querySelector('.fbrowser > .fbar .furl') as HTMLElement;
    if (url.textContent !== r.url) {
      url.textContent = r.url;
      url.classList.add('chg');
      later(() => url.classList.remove('chg'), 500);
    }
    const stage = el.querySelector('.fstage') as HTMLElement;
    const pageKey = JSON.stringify(r.page);
    const keepPage = !!st.popup && stage.dataset.page === pageKey;
    if (!keepPage) { stage.style.animation = 'none'; void stage.offsetHeight; stage.style.animation = ''; }
    stage.dataset.page = pageKey;
    stage.innerHTML = r.page.map(b => fBlock(b, projectName)).join('');
    el.querySelectorAll('.fdim,.fpop,.fring').forEach(e => e.remove());
    const pg = el.querySelector('.fpage') as HTMLElement;
    if (st.popup) {
      pg.insertAdjacentHTML('beforeend', `<div class="fdim"></div><div class="fpop">
        <div class="fbar"><span class="fdots"><i></i><i></i><i></i></span><span class="furl">${esc(st.popup.url || '')}</span></div>
        <div class="fpopb">${st.popup.blocks.map(b => fBlock(b, projectName)).join('')}</div></div>`);
    }

    const target = (el.querySelector('.fpop [data-fclick]') || (!st.popup && el.querySelector('.fstage [data-fclick]'))) as HTMLElement | null;
    const cur = el.querySelector('.fcursor') as SVGElement;
    const next = () => setI(k => (k + 1) % n);
    if (target) {
      // measured when the cursor moves, after any pop-up has finished sliding in
      const hit = { x: 0, y: 0 };
      later(() => {
        const a = pg.getBoundingClientRect(), b = target.getBoundingClientRect();
        hit.x = b.left - a.left + b.width * 0.62; hit.y = b.top - a.top + b.height * 0.55;
        cur.style.left = hit.x + 'px'; cur.style.top = hit.y + 'px';
      }, playing ? 600 : 380);
      if (playing) {
        later(() => {
          target.classList.add('pressed');
          pg.insertAdjacentHTML('beforeend', `<span class="fring" style="left:${hit.x}px;top:${hit.y}px"></span>`);
        }, 1700);
        later(next, 2300);
      }
    } else if (playing) {
      later(next, st.hold || 2400);
    }
    return () => timers.forEach(clearTimeout);
  }, [i, playing, flow, n, projectName]);

  const go = (k: number) => { setPlaying(false); setI(((k % n) + n) % n); };

  return (
    <div className="flow" ref={root}>
      <div className="fbrowser">
        <div className="fbar"><span className="fdots"><i></i><i></i><i></i></span><span className="furl"></span></div>
        <div className="fpage">
          <div className="fstage"></div>
          <svg className="fcursor" viewBox="0 0 24 24"><path d="M3 2l17 9-7.5 1.8L10 21z" fill="#fff" stroke="#111" strokeWidth="2" strokeLinejoin="round" /></svg>
        </div>
      </div>
      <div className="fctl">
        <button type="button" title="Previous step" onClick={() => go(i - 1)}>{'←'}</button>
        <button type="button" onClick={() => setPlaying(p => !p)}>{playing ? 'Pause' : 'Play'}</button>
        <button type="button" title="Next step" onClick={() => go(i + 1)}>{'→'}</button>
        <span className="fttl">{flow.title || ''}</span>
      </div>
      <ol className="fsteps">
        {flow.steps.map((s, k) => (
          <li key={k} className={k === i ? 'on' : ''} onClick={() => go(k)}>{s.caption || ''}</li>
        ))}
      </ol>
    </div>
  );
}
