"use client";

import React, { useEffect, useState } from 'react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredTopic, TopicRevision } from '@/lib/lessonHub/types';
import { topicSummary } from '@/lib/lessonHub/importHtml';
import { fetchRevisions, putTopic } from '@/lib/supabase/queries/lessonHub';

const SOURCE_LABEL: Record<TopicRevision['source'], string> = { mcp: 'Claude', web: 'SpeakFun', import: 'Import' };

/* Every save keeps the version it replaced. A revision row holds the topic as it was
   before that save, with the note describing the change that replaced it. */
export default function HistoryDialog({ supabase, teacherId, topic, onClose, onRestored }: {
  supabase: SupabaseClient;
  teacherId: string;
  topic: StoredTopic;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [revs, setRevs] = useState<TopicRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    fetchRevisions(supabase, teacherId, topic.id).then(setRevs).catch(e => setError(e.message));
  }, [supabase, teacherId, topic.id, topic.version]);

  const restore = async (r: TopicRevision) => {
    if (!confirm(`Restore version ${r.version} of "${topic.title}"? The current version ${topic.version} stays in the history.`)) return;
    setRestoring(r.id);
    try {
      await putTopic(supabase, teacherId, r.data, 'web', `Restored version ${r.version}`);
      onRestored();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center overflow-auto p-4">
      <div className="bg-card text-card-foreground rounded-lg border border-border shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">History · {topic.title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 text-sm">
          <div className="mb-3 text-muted-foreground">Current: version {topic.version} — {topicSummary(topic.data)}</div>
          {error && <div className="text-destructive mb-3">{error}</div>}
          {!revs && !error && <Loader2 className="w-4 h-4 animate-spin" />}
          {revs && revs.length === 0 && <div className="text-muted-foreground">No earlier versions yet.</div>}
          {revs && revs.length > 0 && (
            <div className="border border-border rounded-md divide-y divide-border">
              {revs.map(r => (
                <div key={r.id} className="p-3 flex items-start gap-3">
                  <div className="flex-1">
                    <div><b>Version {r.version}</b> <span className="text-muted-foreground">— {topicSummary(r.data)}</span></div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Replaced {new Date(r.created_at).toLocaleString()} by {SOURCE_LABEL[r.source]}{r.note ? `: ${r.note}` : ''}
                    </div>
                  </div>
                  <button onClick={() => restore(r)} disabled={!!restoring}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50">
                    {restoring === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
