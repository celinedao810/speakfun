"use client";

import React, { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Check, Flag, Play, RotateCcw, Shuffle, SkipForward, Trophy, Undo2, X } from 'lucide-react';
import {
  BOARD, SHORT_SCREEN, TIMERS, available, canAccept, isVocabKey, newRound, ranking, roundReducer,
  type GamePool, type PoolStructure, type PoolVocab, type Round, type RoundAction, type TimerSetting,
} from '@/lib/games/sentenceBuilder';

/*
 * Sentence Builder. The teacher (or a learner, as a playground) runs the turns and judges each
 * sentence out loud; the game only tracks which items are used and the points. Each class keeps
 * its own settings and round in this browser, so classes never share a board.
 */

interface Settings { learners: string; timer: TimerSetting }

const load = <T,>(key: string): T | null => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : null; } catch { return null; }
};
const save = (key: string, v: unknown) => {
  try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ }
};

const parseNames = (text: string) => [...new Set(text.split('\n').map(s => s.trim()).filter(Boolean))];

function enterFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
}
function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

type RoundState = Round | null;
type Action = RoundAction | { type: 'set'; round: RoundState };
function reducer(r: RoundState, a: Action): RoundState {
  if (a.type === 'set') return a.round;
  return r ? roundReducer(r, a) : r;
}

export default function SentenceBuilder({ pool, storageKey }: { pool: GamePool; storageKey: string }) {
  const roundKey = `${storageKey}:round`, settingsKey = `${storageKey}:settings`;
  const [round, dispatch] = useReducer(reducer, null);
  const [settings, setSettings] = useState<Settings>({ learners: '', timer: 60 });
  const [loaded, setLoaded] = useState(false);

  // Load this class's saved round and settings (and start from the class roster the first time)
  useEffect(() => {
    dispatch({ type: 'set', round: load<Round>(roundKey) });
    setSettings(load<Settings>(settingsKey) ?? { learners: (pool.learners ?? []).join('\n'), timer: 60 });
    setLoaded(true);
  }, [roundKey, settingsKey, pool.learners]);

  useEffect(() => { if (loaded) save(roundKey, round); }, [loaded, roundKey, round]);
  useEffect(() => { if (loaded) save(settingsKey, settings); }, [loaded, settingsKey, settings]);

  const items = useMemo(() => {
    const m = new Map<string, PoolVocab | PoolStructure>();
    [...pool.vocab, ...pool.structures].forEach(x => m.set(x.key, x));
    return m;
  }, [pool]);

  const start = () => {
    const learners = parseNames(settings.learners);
    if (!learners.length) return;
    // the board goes full-screen, so size it for the whole screen rather than the current window
    const height = Math.max(window.innerHeight, document.fullscreenEnabled ? window.screen.height : 0);
    enterFullscreen();
    dispatch({ type: 'set', round: newRound(pool, learners, settings.timer,
      height >= SHORT_SCREEN.height ? BOARD.structures : SHORT_SCREEN.structures) });
  };
  const backToSetup = () => { exitFullscreen(); dispatch({ type: 'set', round: null }); };

  if (!loaded) return null;
  if (!round) return <Setup pool={pool} settings={settings} setSettings={setSettings} onStart={start} />;
  return (
    // the game is shown on a shared screen in class: always the light theme, never dark
    <div className="force-light fixed inset-0 z-[100] bg-background text-foreground flex flex-col">
      {round.ended
        ? <Results round={round} items={items} onNewRound={start} onSetup={backToSetup} onUndo={() => dispatch({ type: 'undo' })} />
        : <Board round={round} items={items} pool={pool} dispatch={dispatch} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function Setup({ pool, settings, setSettings, onStart }: {
  pool: GamePool; settings: Settings; setSettings: (s: Settings) => void; onStart: () => void;
}) {
  const names = parseNames(settings.learners);
  const short = pool.vocab.length < BOARD.vocab || pool.structures.length < BOARD.structures;
  const empty = !pool.vocab.length || !pool.structures.length;
  const first = pool.lessons[0]?.no, last = pool.lessons[pool.lessons.length - 1]?.no;
  const shuffleOrder = () => {
    const a = [...names];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    setSettings({ ...settings, learners: a.join('\n') });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-foreground">
          Pool: <b>{pool.vocab.length}</b> vocab, <b>{pool.structures.length}</b> structures
          {first && <span className="text-muted-foreground"> · lessons {first === last ? `L${first}` : `L${first}–L${last}`} of {pool.className}</span>}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          New lessons uploaded to the class&apos;s course join the pool automatically. The two newest lessons come up about twice as often.
        </p>
        {short && !empty && (
          <p className="text-xs text-accent-foreground bg-accent rounded-md px-2.5 py-1.5 mt-2 inline-block">
            The pool is smaller than a full board ({BOARD.vocab} vocab, {BOARD.structures} structures), so the board shows everything in it.
          </p>
        )}
        {empty && (
          <p className="text-xs text-destructive mt-2">
            This class has no {!pool.vocab.length ? 'vocabulary' : 'structures'} yet. Upload a lesson to the class&apos;s course first.
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Players, in turn order</span>
          <textarea
            value={settings.learners}
            onChange={e => setSettings({ ...settings, learners: e.target.value })}
            rows={Math.min(10, Math.max(4, names.length + 1))}
            placeholder={'One name per line\nAn\nBình\nChi'}
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">{names.length} {names.length === 1 ? 'player' : 'players'}</span>
            <button type="button" onClick={shuffleOrder} disabled={names.length < 2}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline">
              <Shuffle className="w-3.5 h-3.5" /> Shuffle order
            </button>
          </span>
        </label>

        <div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Turn timer</span>
          <div className="mt-1.5 flex rounded-lg border border-border overflow-hidden w-fit">
            {TIMERS.map(t => (
              <button key={t} type="button" onClick={() => setSettings({ ...settings, timer: t })}
                className={`px-3 py-1.5 text-sm ${settings.timer === t ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}>
                {t ? `${t} s` : 'Off'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button type="button" onClick={onStart} disabled={!names.length || empty}
        className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40">
        <Play className="w-4 h-4" /> Start
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/** Structure text with its slots styled: [slot], ____ and ... all mark where words go. */
function SlotText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]|_{2,}|\.{3}|…)/);
  return <>{parts.map((p, i) => i % 2
    ? <span key={i} className="rounded px-1 mx-px bg-amber-100 text-amber-900 font-medium whitespace-nowrap">{p.startsWith('[') ? p.slice(1, -1) : '…'}</span>
    : p)}</>;
}

/** Each word in its own nowrap span (see useFitCards). */
function Words({ text }: { text: string }) {
  return <>{text.split(' ').map((w, i) => <React.Fragment key={i}>{i > 0 && ' '}<span data-word className="whitespace-nowrap">{w}</span></React.Fragment>)}</>;
}

function useTurnTimer(round: Round) {
  const [now, setNow] = useState(() => Date.now());
  const beeped = useRef<number | null>(null);
  useEffect(() => {
    if (!round.timer) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [round.timer]);
  const left = round.timer ? Math.max(0, round.timer - Math.floor((now - round.turnStartedAt) / 1000)) : null;
  useEffect(() => {
    // one short beep when a turn's time runs out; the teacher still decides what happens next
    if (left === 0 && beeped.current !== round.turnStartedAt) {
      beeped.current = round.turnStartedAt;
      try {
        const ctx = new AudioContext(), osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = 880; gain.gain.value = 0.15;
        osc.connect(gain).connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.35);
        osc.onended = () => ctx.close();
      } catch { /* no audio */ }
    }
  }, [left, round.turnStartedAt]);
  return left;
}

/*
 * Each card starts at the board's text size and steps down 1px at a time until its text fits,
 * never below the floor readable on a shared screen (vocab 22px, structures 18px).
 * Refits when the board's size changes (window, full-screen) and when the items change.
 */
const TEXT = { vocab: { min: 22, max: 30, vh: 2.9 }, structure: { min: 18, max: 23, vh: 2.25 } };

function useFitCards(root: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const fit = () => {
      el.querySelectorAll<HTMLElement>('[data-fit]').forEach(t => {
        const card = t.closest('button')!;
        const spec = TEXT[t.dataset.fit as keyof typeof TEXT];
        const over = () => card.scrollHeight > card.clientHeight || card.scrollWidth > card.clientWidth;
        let size = Math.round(Math.min(spec.max, Math.max(spec.min, window.innerHeight * spec.vh / 100)));
        t.style.fontSize = `${size}px`;
        // words are kept whole (each one nowrap) so a word that's too wide shrinks the text instead of breaking
        const words = t.querySelectorAll<HTMLElement>('[data-word]');
        const loosen = (on: boolean) => {
          words.forEach(w => { w.style.whiteSpace = on ? 'normal' : ''; });
          t.style.hyphens = on ? 'auto' : '';
        };
        loosen(false);
        t.style.overflowWrap = '';
        const sub = card.querySelector<HTMLElement>('[data-sub]');
        if (sub) sub.style.display = '';
        while (size > spec.min && over()) t.style.fontSize = `${--size}px`;
        // still too big at the floor: drop the part of speech, then let a long word break at a
        // hyphen or syllable, and only as a last resort anywhere
        if (over() && sub) sub.style.display = 'none';
        if (over()) loosen(true);
        if (over()) t.style.overflowWrap = 'anywhere';
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function Board({ round, items, pool, dispatch }: {
  round: Round; items: Map<string, PoolVocab | PoolStructure>; pool: GamePool; dispatch: (a: Action) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const left = useTurnTimer(round);
  const boardRef = useRef<HTMLDivElement>(null);
  useFitCards(boardRef, [round.board, round.used]);
  const avail = available(round);
  const acceptOk = canAccept(round);
  const n = round.learners.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); dispatch({ type: 'undo' }); }
      else if (e.metaKey || e.ctrlKey || e.altKey) return;
      else if (e.key === 'Enter') { e.preventDefault(); dispatch({ type: 'accept' }); }
      else if (e.key.toLowerCase() === 'x') dispatch({ type: 'reject' });
      else if (e.key.toLowerCase() === 'p') dispatch({ type: 'pass' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch]);

  const shuffle = () => {
    if (window.confirm('Replace every available item on the board with a new draw? Used items stay.')) dispatch({ type: 'shuffle', pool });
  };

  const gainFresh = round.lastGain && Date.now() - round.lastGain.at < 2500 ? round.lastGain : null;
  const hovered = hover ? items.get(hover) : null;

  const itemProps = (k: string) => {
    const usedBy = round.used[k];
    const used = usedBy !== undefined;
    const selected = round.selected.includes(k);
    return {
      used, selected, usedBy: used ? round.learners[usedBy] : null,
      onClick: () => dispatch({ type: 'toggle', key: k }),
      onMouseEnter: () => setHover(k), onMouseLeave: () => setHover(h => (h === k ? null : h)),
      className: `relative rounded-xl border text-left transition-colors overflow-hidden ${
        used ? 'bg-muted border-border text-muted-foreground cursor-default'
          : selected ? 'border-primary border-[3px] bg-amber-50 shadow-sm'
            : 'bg-card border-border hover:border-primary/60'}`,
    };
  };

  return (
    <>
      {/* top bar: whose turn, timer, scores */}
      <div className="flex items-center gap-[2vw] px-[2vw] py-[1.4vh] border-b border-border">
        <div className="min-w-0 shrink-0">
          <div className="text-[clamp(11px,1.3vh,14px)] uppercase tracking-wide text-muted-foreground">Now</div>
          <div className="flex items-baseline gap-3">
            <span className="font-bold leading-tight text-[clamp(28px,4.6vh,46px)] truncate max-w-[28vw]">{round.learners[round.turn]}</span>
            {n > 1 && <span className="text-muted-foreground text-[clamp(13px,1.8vh,18px)] truncate max-w-[14vw]">Next: {round.learners[(round.turn + 1) % n]}</span>}
          </div>
        </div>
        {left !== null && (
          <div className={`font-mono font-semibold tabular-nums text-[clamp(28px,4.6vh,46px)] px-3 rounded-lg ${left === 0 ? 'text-white bg-red-500' : left <= 10 ? 'text-red-500' : ''}`}>
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </div>
        )}
        <div className="ml-auto flex flex-wrap justify-end gap-1.5 min-w-0">
          {round.learners.map((name, i) => (
            <div key={i} className={`relative rounded-lg border px-2.5 py-1 text-[clamp(12px,1.6vh,16px)] flex items-baseline gap-1.5 ${i === round.turn ? 'border-primary bg-amber-50' : 'border-border'}`}>
              <span className="truncate max-w-[9rem]">{name}</span>
              <b className="tabular-nums">{round.scores[i]}</b>
              {gainFresh?.learner === i && (
                <span key={gainFresh.at} className="absolute -top-3 right-1 text-xs font-bold text-green-600 animate-bounce">+{gainFresh.points}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* the board: vocabulary 45%, structures 55% */}
      <div ref={boardRef} lang="en" className="flex-1 min-h-0 grid grid-cols-[45fr_55fr] gap-[1.6vw] px-[2vw] py-[1.6vh]">
        <section className="min-h-0 flex flex-col">
          <h2 className="text-[clamp(11px,1.3vh,14px)] uppercase tracking-wide text-muted-foreground mb-[0.8vh]">Vocabulary</h2>
          <div className="flex-1 min-h-0 grid grid-cols-4 grid-rows-5 gap-[0.8vw]">
            {round.board.vocab.map(k => {
              const v = items.get(k) as PoolVocab | undefined;
              if (!v) return <div key={k} />;
              const p = itemProps(k);
              return (
                <button key={k} type="button" disabled={p.used} onClick={p.onClick} onMouseEnter={p.onMouseEnter} onMouseLeave={p.onMouseLeave}
                  className={`${p.className} flex flex-col justify-center px-[0.5vw] py-[0.6vh]`}>
                  <span className="absolute top-1 right-1.5 text-[11px] text-muted-foreground">L{v.lesson}</span>
                  <span data-fit="vocab" className={`font-semibold leading-tight ${p.used ? 'line-through' : ''}`}><Words text={v.word} /></span>
                  {v.pos && <span data-sub className="text-[clamp(11px,1.4vh,14px)] text-muted-foreground">{v.pos}</span>}
                  {p.usedBy && <span className="text-[11px] text-muted-foreground truncate">{p.usedBy}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="min-h-0 flex flex-col">
          <h2 className="text-[clamp(11px,1.3vh,14px)] uppercase tracking-wide text-muted-foreground mb-[0.8vh]">Structures</h2>
          <div className={`flex-1 min-h-0 grid grid-cols-3 gap-[0.8vw] ${round.board.structures.length > SHORT_SCREEN.structures ? 'grid-rows-5' : 'grid-rows-4'}`}>
            {round.board.structures.map(k => {
              const s = items.get(k) as PoolStructure | undefined;
              if (!s) return <div key={k} />;
              const p = itemProps(k);
              return (
                <button key={k} type="button" disabled={p.used} onClick={p.onClick} onMouseEnter={p.onMouseEnter} onMouseLeave={p.onMouseLeave}
                  className={`${p.className} flex flex-col justify-center px-[0.8vw] py-[0.6vh]`}>
                  <span className="absolute top-1 right-1.5 text-[11px] text-muted-foreground">L{s.lesson}</span>
                  <span data-fit="structure" className={`leading-snug pr-5 ${p.used ? 'line-through' : ''}`}><SlotText text={s.text} /></span>
                  {p.usedBy && <span className="text-[11px] text-muted-foreground truncate">{p.usedBy}</span>}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* actions */}
      <div className="flex items-center gap-2 px-[2vw] py-[1.2vh] border-t border-border">
        <BarButton onClick={() => dispatch({ type: 'undo' })} disabled={!round.history.length} title="Undo (Ctrl/Cmd+Z)"><Undo2 className="w-4 h-4" />Undo</BarButton>
        <BarButton onClick={shuffle} title="New draw for the available items"><Shuffle className="w-4 h-4" />Shuffle board</BarButton>
        <BarButton onClick={() => dispatch({ type: 'end' })}><Flag className="w-4 h-4" />End round</BarButton>
        <div className="flex-1 min-w-0 px-3 text-center text-[clamp(12px,1.55vh,15px)] text-muted-foreground truncate">
          {hovered
            ? 'word' in hovered
              ? <><b className="text-foreground">{hovered.word}</b>{hovered.pos && ` (${hovered.pos})`}: {hovered.definition}{hovered.example && <i> · {hovered.example}</i>}</>
              : <>{hovered.intent}{hovered.example && <i> · {hovered.example}</i>}</>
            : <>Vocab left: <b className="text-foreground">{avail.vocab.length}</b> · Structures left: <b className="text-foreground">{avail.structures.length}</b></>}
        </div>
        <BarButton onClick={() => dispatch({ type: 'reject' })} title="Not accepted (X)" className="text-red-600 border-red-200 hover:bg-red-50"><X className="w-4 h-4" />Not accepted</BarButton>
        <BarButton onClick={() => dispatch({ type: 'pass' })} title="Pass (P)"><SkipForward className="w-4 h-4" />Pass</BarButton>
        <button type="button" onClick={() => dispatch({ type: 'accept' })} disabled={!acceptOk}
          title={acceptOk ? 'Accept (Enter)' : 'Select at least 1 vocab item and 1 structure'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-5 py-2 text-[clamp(14px,1.8vh,17px)] font-semibold hover:bg-green-700 disabled:opacity-35 disabled:hover:bg-green-600">
          <Check className="w-5 h-5" />Accept{round.selected.length ? ` +${round.selected.length}` : ''}
        </button>
      </div>
    </>
  );
}

function BarButton({ className = '', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[clamp(13px,1.6vh,15px)] hover:bg-muted disabled:opacity-35 disabled:hover:bg-transparent whitespace-nowrap ${className}`}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function Results({ round, items, onNewRound, onSetup, onUndo }: {
  round: Round; items: Map<string, PoolVocab | PoolStructure>; onNewRound: () => void; onSetup: () => void; onUndo: () => void;
}) {
  const rows = ranking(round);
  const top = rows[0]?.score ?? 0;
  const label = (k: string) => {
    const x = items.get(k);
    return !x ? null : 'word' in x ? x.word : x.text;
  };
  return (
    <div className="flex-1 min-h-0 flex flex-col px-[4vw] py-[4vh]">
      <h1 className="flex items-center gap-3 text-[clamp(26px,4.4vh,42px)] font-bold mb-[3vh]"><Trophy className="w-9 h-9 text-primary" />Results</h1>
      <ol className="flex-1 min-h-0 overflow-y-auto space-y-[1.2vh]">
        {rows.map(row => {
          const win = top > 0 && row.score === top;
          return (
            <li key={row.index} className={`rounded-xl border px-[1.4vw] py-[1.2vh] ${win ? 'border-primary border-2 bg-amber-50' : 'border-border'}`}>
              <div className="flex items-baseline gap-3">
                <span className="text-muted-foreground tabular-nums w-6">{row.rank}</span>
                <span className="font-semibold text-[clamp(18px,2.6vh,26px)]">{row.name}</span>
                {win && <span className="text-xs font-semibold text-accent-foreground bg-accent rounded px-1.5 py-0.5">Winner</span>}
                <span className="ml-auto font-bold tabular-nums text-[clamp(18px,2.6vh,26px)]">{row.score} {row.score === 1 ? 'point' : 'points'}</span>
              </div>
              {row.items.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-[0.8vh] ml-9">
                  {[...row.items].sort((a, b) => Number(isVocabKey(b)) - Number(isVocabKey(a))).map(k => {
                    const t = label(k);
                    return t && <span key={k} className={`text-[clamp(12px,1.6vh,15px)] rounded-md border border-border px-2 py-0.5 ${isVocabKey(k) ? 'font-medium' : ''}`}>
                      {isVocabKey(k) ? t : <SlotText text={t} />}
                    </span>;
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-2 pt-[2.4vh]">
        <button type="button" onClick={onNewRound}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90">
          <RotateCcw className="w-4 h-4" /> New round
        </button>
        <BarButton onClick={onSetup}>Back to setup</BarButton>
        {round.history.length > 0 && <BarButton onClick={onUndo} title="Undo the last turn and go back to the board"><Undo2 className="w-4 h-4" />Undo</BarButton>}
      </div>
    </div>
  );
}

