"use client";

import React, { useMemo, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Hub, StoredTopic, Topic } from '@/lib/lessonHub/types';
import { parseHubHtml, topicSummary, type ImportedHub } from '@/lib/lessonHub/importHtml';
import { validateHub, validateTopic } from '@/lib/lessonHub/schema';
import { putTopic, saveHub } from '@/lib/supabase/queries/lessonHub';

/* Import one or more E4IT hub HTML files. Different chat sessions produced different
   copies of the hub, so the same topic can appear in several files. For each topic the
   teacher picks which version to keep; nothing already saved is replaced unless chosen. */

interface Candidate { file: ImportedHub; modified: number; topic: Topic; errors: string[] }
const KEEP = '__keep__';

export default function ImportDialog({ supabase, teacherId, hasHub, saved, onClose, onDone }: {
  supabase: SupabaseClient;
  teacherId: string;
  hasHub: boolean;
  saved: StoredTopic[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [files, setFiles] = useState<{ parsed: ImportedHub; modified: number }[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [hubFrom, setHubFrom] = useState<string>(hasHub ? KEEP : '');
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedById = useMemo(() => new Map(saved.map(s => [s.id, s])), [saved]);

  const readFiles = async (list: FileList | null) => {
    if (!list) return;
    const ok: { parsed: ImportedHub; modified: number }[] = [];
    const errs: string[] = [];
    for (const f of Array.from(list)) {
      try { ok.push({ parsed: parseHubHtml(await f.text(), f.name), modified: f.lastModified }); }
      catch (e) { errs.push((e as Error).message); }
    }
    ok.sort((a, b) => b.modified - a.modified);   // newest first
    setFiles(ok);
    setParseErrors(errs);
    if (!hasHub && ok[0]) setHubFrom(ok[0].parsed.fileName);
  };

  // topic id -> versions found across files, newest file first
  const byId = useMemo(() => {
    const m = new Map<string, Candidate[]>();
    for (const { parsed, modified } of files) {
      for (const t of parsed.topics) {
        const list = m.get(t.id) ?? [];
        list.push({ file: parsed, modified, topic: t, errors: validateTopic(t, parsed.hub) });
        m.set(t.id, list);
      }
    }
    return m;
  }, [files]);

  const chosen = (id: string): string => {
    if (choice[id]) return choice[id];
    if (savedById.has(id)) return KEEP;
    return byId.get(id)?.find(c => !c.errors.length)?.file.fileName ?? KEEP;
  };

  const ids = [...byId.keys()].sort();
  const toWrite = ids.filter(id => chosen(id) !== KEEP);

  const runImport = async () => {
    setBusy(true); setError(null);
    try {
      if (hubFrom && hubFrom !== KEEP) {
        const hub = files.find(f => f.parsed.fileName === hubFrom)!.parsed.hub;
        const errs = validateHub(hub);
        if (errs.length) throw new Error(`Hub in ${hubFrom}: ${errs.join('; ')}`);
        await saveHub(supabase, teacherId, hub as Hub);
      }
      for (const id of toWrite) {
        const c = byId.get(id)!.find(x => x.file.fileName === chosen(id))!;
        await putTopic(supabase, teacherId, c.topic, 'import', `Imported from ${c.file.fileName}`);
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canImport = (hubFrom && hubFrom !== KEEP) || toWrite.length > 0;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center overflow-auto p-4">
      <div className="bg-card text-card-foreground rounded-lg border border-border shadow-xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">Import from hub HTML files</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5 text-sm">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-muted/50">
            <Upload className="w-5 h-5 text-muted-foreground" />
            <span>Choose one or more <b>e4it-offline*.html</b> files</span>
            <span className="text-xs text-muted-foreground">Each topic can then be taken from whichever file has the best version.</span>
            <input type="file" accept=".html,text/html" multiple className="hidden" onChange={e => readFiles(e.target.files)} />
          </label>

          {parseErrors.length > 0 && (
            <div className="text-destructive text-xs space-y-1">{parseErrors.map((e, i) => <div key={i}>{e}</div>)}</div>
          )}

          {files.length > 0 && <>
            <div>
              <div className="font-medium mb-2">Course, project, plan and rules</div>
              <select value={hubFrom} onChange={e => setHubFrom(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 bg-background">
                {hasHub && <option value={KEEP}>Keep what&apos;s saved</option>}
                {files.map(f => <option key={f.parsed.fileName} value={f.parsed.fileName}>
                  From {f.parsed.fileName} ({new Date(f.modified).toLocaleString()})
                </option>)}
              </select>
            </div>

            <div>
              <div className="font-medium mb-2">Topics</div>
              <div className="border border-border rounded-md divide-y divide-border">
                {ids.map(id => {
                  const cands = byId.get(id)!;
                  const s = savedById.get(id);
                  const cur = chosen(id);
                  return (
                    <div key={id} className="p-3">
                      <div className="font-medium">{cands[0].topic.title} <span className="text-muted-foreground font-normal">· {id}</span></div>
                      <div className="mt-2 space-y-1">
                        {s && (
                          <label className="flex gap-2 items-start">
                            <input type="radio" name={id} checked={cur === KEEP} onChange={() => setChoice(c => ({ ...c, [id]: KEEP }))} className="mt-1" />
                            <span>Keep saved version {s.version} <span className="text-muted-foreground">— {topicSummary(s.data)}</span></span>
                          </label>
                        )}
                        {!s && (
                          <label className="flex gap-2 items-start">
                            <input type="radio" name={id} checked={cur === KEEP} onChange={() => setChoice(c => ({ ...c, [id]: KEEP }))} className="mt-1" />
                            <span className="text-muted-foreground">Skip this topic</span>
                          </label>
                        )}
                        {cands.map(c => (
                          <label key={c.file.fileName} className={`flex gap-2 items-start ${c.errors.length ? 'opacity-60' : ''}`}>
                            <input type="radio" name={id} disabled={c.errors.length > 0} checked={cur === c.file.fileName}
                              onChange={() => setChoice(ch => ({ ...ch, [id]: c.file.fileName }))} className="mt-1" />
                            <span>
                              {c.file.fileName} <span className="text-muted-foreground">— {topicSummary(c.topic)}</span>
                              {c.errors.length > 0 && <span className="block text-destructive text-xs">{c.errors.slice(0, 3).join('; ')}{c.errors.length > 3 ? ` (+${c.errors.length - 3} more)` : ''}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>}

          {error && <div className="text-destructive">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-border hover:bg-muted">Cancel</button>
          <button onClick={runImport} disabled={!canImport || busy}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Import {toWrite.length} topic{toWrite.length === 1 ? '' : 's'}{hubFrom && hubFrom !== KEEP ? ' + hub' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
