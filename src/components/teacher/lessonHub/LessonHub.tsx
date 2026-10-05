"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bricolage_Grotesque, DM_Mono, Newsreader, Noto_Sans } from 'next/font/google';
import type { Hub, Topic } from '@/lib/lessonHub/types';
import { dueRound, fmtClock, isPron, planFor, talkTime } from '@/lib/lessonHub/engine';
import { DlgState, HubProvider } from './shared';
import { PlanPhases, Rail, ShapeStrip, SoundNotes } from './rounds';
import PresentMode from './PresentMode';
import './e4it.css';

const sans = Bricolage_Grotesque({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '800'], variable: '--e4it-font-sans' });
const serif = Newsreader({ subsets: ['latin'], weight: ['300', '400', '600'], style: ['normal', 'italic'], variable: '--e4it-font-serif' });
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--e4it-font-mono' });
const ipa = Noto_Sans({ subsets: ['latin', 'latin-ext', 'greek'], weight: ['400', '500'], variable: '--e4it-font-ipa' });

type View = 'hub' | 'topic' | 'project' | 'rules';

export interface LessonHubNav {
  view: View;
  topicId: string | null;
}

// Scroll-spy threshold: the original 140px plus SpeakFun's 64px header.
const SPY_OFFSET = 204;

export default function LessonHub({ hub, topics, initialTopicId, onNavigate }: {
  hub: Hub;
  topics: Topic[];
  initialTopicId?: string | null;
  onNavigate?: (nav: LessonHubNav) => void;
}) {
  const initial = initialTopicId ? topics.find(t => t.id === initialTopicId) : undefined;
  const [view, setView] = useState<View>(initial ? 'topic' : 'hub');
  const [track, setTrack] = useState(initial?.track ?? hub.tracks[0]);
  const [topicId, setTopicId] = useState<string | null>(initial?.id ?? null);
  const [present, setPresent] = useState(false);
  const [slide, setSlide] = useState(0);
  const [dlg, setDlgState] = useState<DlgState>({ hide: null, frames: true, hint: false, answers: false, revealed: [] });
  const setDlg = useCallback((p: Partial<DlgState>) => setDlgState(d => ({ ...d, ...p })), []);

  const topic = useMemo(() => topics.find(t => t.id === topicId) || null, [topics, topicId]);

  // navigation goes to the top; in-place controls keep the reader where they were
  const go = (v: View, id: string | null = topicId) => {
    setView(v); setTopicId(id); setPresent(false);
    const t = id ? topics.find(x => x.id === id) : undefined;
    if (v === 'topic' && t) setTrack(t.track);
    window.scrollTo(0, 0);
    onNavigate?.({ view: v, topicId: id });
  };

  // ---- class timer ----
  const [sec, setSec] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(tick);
  }, [running]);
  const plan = topic ? planFor(topic, hub) : hub.plan;
  const due = view === 'topic' ? dueRound(plan, sec) : null;

  // ---- scroll spy ----
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (view !== 'topic' || present) return;
    const spy = () => {
      const links = [...document.querySelectorAll<HTMLElement>('#rail a[data-goto]')];
      let on = links[0]?.dataset.goto ?? null;
      links.forEach(a => {
        const sec = document.getElementById(a.dataset.goto!);
        if (sec && sec.getBoundingClientRect().top <= SPY_OFFSET) on = a.dataset.goto!;
      });
      setActive(on);
    };
    spy();
    window.addEventListener('scroll', spy, { passive: true });
    return () => window.removeEventListener('scroll', spy);
  }, [view, present, topicId]);

  const gotoSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const fonts = `${sans.variable} ${serif.variable} ${mono.variable} ${ipa.variable}`;

  return (
    <HubProvider value={{ hub, topic, dlg, setDlg }}>
      <div className={`e4it ${fonts}`}>
        <div className="bar">
          <button type="button" className="code" onClick={() => go('hub')}>
            E4IT <span>{hub.course.name}</span>
          </button>
          <div className={`timer${view === 'topic' ? '' : ' hide'}`}>
            <span className="tclock">{fmtClock(sec)}</span>
            <button type="button" className={running ? 'run' : ''} onClick={() => setRunning(r => !r)}>{running ? 'Pause' : 'Start'}</button>
            <button type="button" onClick={() => { setRunning(false); setSec(0); }}>Reset</button>
            <span className={`tstatus${due && due.over > 0 ? ' late' : ''}`}>
              {due && (due.over > 0
                ? `${Math.round(due.over)}′ over — should be past ${due.title.toLowerCase()}`
                : `on plan — ${due.title.toLowerCase()}`)}
            </span>
          </div>
          <button type="button" className={`proj${view === 'project' ? ' on' : ''}`} onClick={() => go('project')}>The project</button>
          <button type="button" className={`proj${view === 'rules' ? ' on' : ''}`} onClick={() => go('rules')}>Class rules</button>
        </div>
        <div className="e4main">
          {view === 'hub' && <HubView hub={hub} topics={topics} track={track} setTrack={setTrack} open={id => go('topic', id)} />}
          {view === 'project' && <ProjectView hub={hub} back={() => go('hub')} />}
          {view === 'rules' && <RulesView hub={hub} back={() => go('hub')} />}
          {view === 'topic' && topic && (
            <TopicView hub={hub} t={topic} back={() => go('hub')}
              onPresent={() => { setSlide(0); setPresent(true); }}
              rail={<Rail t={topic} active={active} dueAt={due ? due.at : null} onGoto={gotoSection} />} />
          )}
          {view === 'topic' && !topic && <p className="note">This topic no longer exists. <button type="button" className="back" onClick={() => go('hub')}>Back to topics</button></p>}
        </div>
        {present && topic && <PresentMode t={topic} slide={slide} setSlide={setSlide} onExit={() => setPresent(false)} />}
      </div>
    </HubProvider>
  );
}

function HubView({ hub, topics, track, setTrack, open }: {
  hub: Hub; topics: Topic[]; track: string; setTrack: (t: string) => void; open: (id: string) => void;
}) {
  const inTrack = topics.filter(t => t.track === track).sort((a, b) => a.order - b.order);
  const soon = hub.soon[track] || [];
  const pron = inTrack.some(isPron) || track === 'Pronunciation';
  const words = inTrack.reduce((n, t) => n + (t.vocabulary?.length ?? 0), 0);
  const frames = inTrack.reduce((n, t) => n + (t.structures?.length ?? 0), 0);

  return (
    <>
      <div className="masthead">
        <h1>{hub.course.name}</h1>
        <div className="tally">
          {pron ? <>
            <div><div className="n">{inTrack.length + soon.length}</div><div className="l">sessions in the series</div></div>
            <div><div className="n">{inTrack.length}</div><div className="l">built out</div></div>
            <div><div className="n">1</div><div className="l">version for both tracks</div></div>
          </> : <>
            <div><div className="n">{inTrack.length + soon.length}</div><div className="l">topics in this track</div></div>
            <div><div className="n">{words}</div><div className="l">words built out</div></div>
            <div><div className="n">{frames}</div><div className="l">sentence frames</div></div>
          </>}
        </div>
      </div>

      <div className="tabs">
        {hub.tracks.map(t => <button type="button" key={t} className={track === t ? 'on' : ''} onClick={() => setTrack(t)}>{t}</button>)}
      </div>

      <table className="topics"><tbody>
        {inTrack.map(t => (
          <tr key={t.id} className="open" onClick={() => open(t.id)}>
            <td className="tnum">{t.order}</td>
            <td><div className="tt">{t.title}</div><div className="tmeet">{t.meeting}</div><div className="tanchor">{t.anchor}</div></td>
            <td className="tcount">{isPron(t)
              ? `${t.rounds!.filter(r => r.phase === 'class').length} rounds`
              : <>{t.vocabulary?.length ?? 0} words<br />{t.structures?.length ?? 0} frames</>}</td>
          </tr>
        ))}
        {soon.map(([n, title]) => (
          <tr key={`soon-${n}-${title}`} className="soon"><td className="tnum">{n}</td>
            <td><div className="tt">{title}</div></td><td className="tsoon">being written</td></tr>
        ))}
      </tbody></table>

      {pron
        ? <p className="note">One pronunciation session after every two topic lessons, shared by the Developer and
            BA / QA tracks. Individual sounds are taught in session 1 and practised again in session 8; in between,
            they&apos;re reminders, not lesson content.</p>
        : <p className="note">Every topic runs on one shared project, {hub.project.name}, so learners aren&apos;t
            inventing a situation before they can make a sentence. Their own work comes back in the free rounds.</p>}
    </>
  );
}

function ProjectView({ hub, back }: { hub: Hub; back: () => void }) {
  const p = hub.project;
  return (
    <>
      <button type="button" className="back" onClick={back}>Back to topics</button>
      <div className="thead">
        <div className="kicker">The shared project</div>
        <h2>{p.name}</h2>
        <p className="says">{p.oneLine}</p>
      </div>
      <div className="msec"><h3>How it works</h3>
        <ul className="plain">{(p.howItWorks || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      <div className="msec"><h3>Modules</h3>
        <div className="mods">{p.modules.map((m, i) => <span key={i}>{m}</span>)}</div></div>
      <div className="msec"><h3>Where things stand</h3>
        <div className="timeline">{p.timeline.map((r, i) => <div key={i}><div className="wh">{r.wh}</div><div className="wt">{r.wt}</div></div>)}</div></div>
    </>
  );
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function RulesView({ hub, back }: { hub: Hub; back: () => void }) {
  const R = hub.rules;
  return (
    <>
      <button type="button" className="back" onClick={back}>Back to topics</button>
      <div className="thead">
        <div className="kicker">Before we start</div>
        <h2>Class rules</h2>
        <p className="says">{R.welcome}</p>
      </div>
      <div className="msec" style={{ borderTop: 0, paddingTop: '1rem' }}>
        <h3>{COUNT_WORDS[R.rules.length] ?? R.rules.length} rules in {R.teacher}&apos;s class</h3>
        {R.rules.map((r, i) => (
          <div key={i} className="rule">
            <div className="rn">{i + 1}</div>
            <div><h4>{r.title}</h4><p>{r.text}</p>{r.note && <span className="rnote">{r.note}</span>}</div>
          </div>
        ))}
      </div>
      <div className="msec"><h3>Reminders</h3>
        <div className="reminders">{R.reminders.map((r, i) => <span key={i}>{r}</span>)}</div></div>
    </>
  );
}

function TopicView({ hub, t, back, onPresent, rail }: {
  hub: Hub; t: Topic; back: () => void; onPresent: () => void; rail: React.ReactNode;
}) {
  const P = planFor(t, hub);
  const pron = isPron(t);
  return (
    <>
      <button type="button" className="back" onClick={back}>{pron ? 'Back to pronunciation sessions' : `Back to ${t.track} topics`}</button>
      <div className="thead">
        <div className="kicker">{pron ? `Pronunciation · session ${t.order}` : `${t.track} · topic ${t.order}`}</div>
        <h2>{t.title}</h2>
        <p className="says">{t.says}</p>
        {!pron && <div className="ticket"><b>This topic runs on</b>{t.anchor}</div>}
        {!pron && <ShapeStrip t={t} />}
        <div className="facts">
          <span>{t.cefr}</span>
          {pron
            ? <span>{P.filter(r => r.phase === 'class').length} rounds</span>
            : <><span>{t.vocabulary?.length ?? 0} words</span><span>{t.structures?.length ?? 0} frames</span></>}
          <span>~{Math.round(talkTime(P, hub))} min speaking each</span>
        </div>
      </div>
      <button type="button" className="presentbtn" onClick={onPresent}>Present {'↗'}</button>
      <div className="withrail">
        {rail}
        <div><PlanPhases t={t} />{pron && <SoundNotes t={t} />}</div>
      </div>
    </>
  );
}
