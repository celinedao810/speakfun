"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, History, Loader2, RefreshCw, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchHub, fetchTopics } from '@/lib/supabase/queries/lessonHub';
import type { Hub, StoredTopic } from '@/lib/lessonHub/types';
import LessonHub, { type LessonHubNav } from '@/components/teacher/lessonHub/LessonHub';
import ImportDialog from '@/components/teacher/lessonHub/ImportDialog';
import HistoryDialog from '@/components/teacher/lessonHub/HistoryDialog';

export default function LessonPlansPage() {
  const { user } = useAuth();
  const [hub, setHub] = useState<Hub | null>(null);
  const [topics, setTopics] = useState<StoredTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nav, setNav] = useState<LessonHubNav>({ view: 'hub', topicId: null });
  const [initialTopic, setInitialTopic] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [h, t] = await Promise.all([fetchHub(supabase, user.id), fetchTopics(supabase, user.id)]);
      setHub(h); setTopics(t); setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Claude edits topics from another tab: pick up its changes when the teacher comes back.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Deep link from the connector's save results: /teacher/lesson-plans?topic=dev-03
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('topic');
    if (id) { setInitialTopic(id); setNav({ view: 'topic', topicId: id }); }
  }, []);

  if (!user) return null;
  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const current = nav.view === 'topic' ? topics.find(t => t.id === nav.topicId) ?? null : null;

  const copyJson = async () => {
    if (!current) return;
    await navigator.clipboard.writeText(JSON.stringify(current.data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const btn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted transition';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <span className="text-muted-foreground mr-auto">
          {current
            ? <>Version {current.version} · updated {new Date(current.updated_at).toLocaleString()}</>
            : <>{topics.length} topic{topics.length === 1 ? '' : 's'} · edit them from a Claude chat with the SpeakFun connector</>}
        </span>
        {current && <>
          <button className={btn} onClick={() => setShowHistory(true)}><History className="w-4 h-4" />History</button>
          <button className={btn} onClick={copyJson}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}Copy JSON</button>
        </>}
        <button className={btn} onClick={load} title="Reload from SpeakFun"><RefreshCw className="w-4 h-4" />Refresh</button>
        <button className={btn} onClick={() => setShowImport(true)}><Upload className="w-4 h-4" />Import HTML</button>
      </div>

      {error && <div className="mb-4 text-sm text-destructive">{error}</div>}

      {hub ? (
        <LessonHub key={initialTopic ?? 'hub'} hub={hub} topics={topics.map(t => t.data)}
          initialTopicId={initialTopic} onNavigate={setNav} />
      ) : (
        <div className="border-2 border-dashed border-border rounded-lg p-10 text-center">
          <h2 className="font-semibold mb-1">No lesson hub yet</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Import your E4IT hub HTML files. If you have several versions, import them all at once and pick the best version of each topic.
          </p>
          <button className={`${btn} mx-auto`} onClick={() => setShowImport(true)}><Upload className="w-4 h-4" />Import HTML</button>
        </div>
      )}

      {showImport && (
        <ImportDialog supabase={supabase} teacherId={user.id} hasHub={!!hub} saved={topics}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load(); }} />
      )}
      {showHistory && current && (
        <HistoryDialog supabase={supabase} teacherId={user.id} topic={current}
          onClose={() => setShowHistory(false)}
          onRestored={() => { setShowHistory(false); load(); }} />
      )}
    </div>
  );
}
