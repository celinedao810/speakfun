// MCP connector for the E4IT lesson hub. Added in claude.ai as a custom connector
// (https://<domain>/api/mcp/<LESSON_MCP_TOKEN>) so Claude can read and edit lesson
// topics from a normal chat, on the teacher's claude.ai subscription.
// Stateless Streamable HTTP: a fresh server per request, JSON responses.

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { bankWarnings, trackDuplicates, validateHub, validateTopic } from '@/lib/lessonHub/schema';
import type { Hub, InterviewBank, Topic } from '@/lib/lessonHub/types';
import { topicKind } from '@/lib/lessonHub/engine';
import { allFrameworkNames, bankIndex, emptyPicks, frameworkNames, picksByFramework, picksByRound, withMandatory } from '@/lib/lessonHub/interview';
import {
  fetchHub, fetchRevision, fetchRevisions, fetchTopic, fetchTopics, patchTopic, putTopic, saveHubKey,
} from '@/lib/supabase/queries/lessonHub';
import { fetchInterviewPicks } from '@/lib/supabase/queries/interviewPicks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function tokenOk(token: string): boolean {
  const expected = process.env.LESSON_MCP_TOKEN;
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(token), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const INSTRUCTIONS = `This connector edits the E4IT ("English for IT Professionals") speaking-course lesson hub stored in SpeakFun.
The hub holds the course, the shared project (SpeakFun), the fixed 90-minute class plan, tracks and class rules.
Each topic (lesson) is stored separately, so edit only the topic you're working on.

How to work:
- Talk the change through with the teacher first. Save only when they agree, unless they asked you to save directly.
- Before editing, call get_topic and use its version as expected_version in update_topic. On a version conflict, re-read and re-apply.
- update_topic replaces whole top-level keys (e.g. send the full "dialogue" object, not one line). Keys you don't send are untouched.
- Every save is validated (including, within a track: no vocabulary word taught twice and no frame reused word for word (paraphrases are fine); and each frame in exactly one move) and keeps the previous version as a revision. If the teacher wants an edit undone, use list_revisions and restore_revision.

Speaking topics (Developer, BA / QA tracks) all run on the hub's fixed plan (see get_hub → plan), whose rounds read these fields:
context or reading, leadIn, vocabulary [{word,pos,definition,example}], structures [{structure with [slot] markers, intent, example, alternative, promptSlots}],
scenes [{name, setting, moves:[{name, purpose, frames:[structure indices]}]}], dialogue {context, roles, lines:[{role, text, scene?, part?, gaps:[{text, frame}]}]},
speaking {scenario, roles:[{name, tasks}]}, homework, comprehension, optional flow (animated user-flow sketch).
Rules: every gap text must appear verbatim in its line and is blanked when learners read aloud; frame indices point into structures;
dialogue roles must be listed in dialogue.roles; moves list frames in the order they're used.
promptSlots ("Which frame?") lists one filler per [slot], in order, separated by " / "; the answer key is the frame with its slots
filled from them, so the fillers may differ from the example (if the counts don't match, the example is shown instead).
Pronunciation topics carry their own "rounds" (with parts of kind reveal, pairs, rules, passage, text, choice, twisters, dictation,
explain, columns, stressguide, stressdemo, wordbank, or a game) and soundNotes. Copy the shape of an existing part of the same kind
from a saved pronunciation topic (pron-03 has the word-stress kinds); stressguide/stressdemo words need natural < syllables.length.

Interview topics (kind: "interview") teach a framework for a type of interview question; learners then build their own answers.
They don't use the fixed plan, vocabulary, structures or dialogue. Fields: id, kind, track, order, title, cefr, says, goal, leadIn,
segments [{title, min, phase?, uses}] (uses is "leadIn", "questionBank", "framework:<id>" or "homework"; phase defaults to "class"),
frameworks [{id, name, flow, length, why, notes?, modelQuestion (a bank question id), steps:[{name, purpose, frames:[{structure with
[slot] markers, example, alternative|null}]}], modelAnswer {persona, paragraphs}, buildOwn}], homework.
Rules: every framework is used by a segment and taught in one topic only (framework ids are unique across the track); frames follow the
same no-word-for-word-reuse rule as speaking structures, across interview and speaking topics alike.
The question bank is shared by the whole interview series of a track: get_hub → interviewBanks[track] = {rounds:[{id, name,
groups:[{id, name, framework?, questions:[{id, text (may hold [slot] markers learners fill from their own project), mandatory?,
framework?}]}]}]}. Save it with update_hub key "interviewBanks" (the whole map). Question ids are permanent once a class has picked
them: add new ids rather than reusing one; update_hub warns when a change drops a question on the class's list.
The class being taught picks as many questions from the bank as it wants (mandatory ones are always on the list) and may ask for
extra ones; the teacher records this in the lesson hub and clears it when the series ends. Every later interview session follows
that list: read it with get_interview_picks (read-only) to choose which frameworks and model answers to prepare.`;

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}
function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function buildServer(db: SupabaseClient, teacherId: string, origin: string) {
  // Within a track a word is taught once and a frame used once: compare against every other saved topic.
  const duplicatesFor = async (t: Topic) =>
    trackDuplicates(t, (await fetchTopics(db, teacherId)).map(r => r.data));

  const server = new McpServer({ name: 'speakfun-lessons', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  const topicUrl = (id: string) => `${origin}/teacher/lesson-plans?topic=${encodeURIComponent(id)}`;

  server.registerTool('get_hub', {
    title: 'Get the course hub',
    description: 'The course, the shared project, the fixed class plan for speaking topics, tracks, upcoming topics ("soon") and class rules.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const hub = await fetchHub(db, teacherId);
    return hub ? text(hub) : fail('No hub yet. The teacher needs to import a hub HTML file in SpeakFun first.');
  });

  server.registerTool('list_topics', {
    title: 'List topics',
    description: 'All topics (lessons) with id, track, order, title, version and last update. Optionally filter by track.',
    inputSchema: { track: z.string().optional().describe('e.g. "Developer", "BA / QA", "Pronunciation"') },
    annotations: { readOnlyHint: true },
  }, async ({ track }) => {
    const rows = await fetchTopics(db, teacherId);
    return text(rows.filter(r => !track || r.track === track).map(r => ({
      id: r.id, kind: topicKind(r.data), track: r.track, order: r.sort_order, title: r.title, version: r.version, updated_at: r.updated_at,
    })));
  });

  server.registerTool('get_topic', {
    title: 'Get a topic',
    description: 'The full topic JSON and its current version. Read this before editing.',
    inputSchema: { id: z.string().describe('Topic id, e.g. "dev-03"') },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    const row = await fetchTopic(db, teacherId, id);
    return row ? text({ kind: topicKind(row.data), version: row.version, updated_at: row.updated_at, url: topicUrl(id), topic: row.data })
      : fail(`No topic "${id}". Use list_topics to see what exists.`);
  });

  server.registerTool('update_topic', {
    title: 'Update a topic',
    description: 'Save changes to a topic by replacing whole top-level keys (e.g. {"dialogue": {...}, "vocabulary": [...]}). '
      + 'Validated before saving; the previous version is kept as a revision. Pass the version from get_topic as expected_version.',
    inputSchema: {
      id: z.string(),
      patch: z.record(z.string(), z.any()).describe('Top-level topic keys to replace'),
      expected_version: z.number().int().optional().describe('Version you read; the save fails if someone changed the topic since'),
      note: z.string().describe('One line describing the change, shown in the history'),
    },
  }, async ({ id, patch, expected_version, note }) => {
    if ('id' in patch && patch.id !== id) return fail('Changing a topic id is not supported; create_topic with the new id instead.');
    const [row, hub] = await Promise.all([fetchTopic(db, teacherId, id), fetchHub(db, teacherId)]);
    if (!row) return fail(`No topic "${id}".`);
    if (expected_version != null && row.version !== expected_version) {
      return fail(`Version conflict: you read version ${expected_version}, the topic is now at version ${row.version}. Call get_topic again and re-apply your change.`);
    }
    const merged = { ...row.data, ...patch } as Topic;
    const errors = validateTopic(merged, hub);
    if (!errors.length && ['vocabulary', 'structures', 'frameworks', 'kind', 'track'].some(k => k in patch)) errors.push(...await duplicatesFor(merged));
    if (errors.length) return fail(`Not saved. Fix these and try again:\n- ${errors.join('\n- ')}`);
    try {
      const saved = await patchTopic(db, teacherId, id, patch as Partial<Topic>, expected_version ?? null, 'mcp', note);
      return text({ saved: true, id, version: saved.version, url: topicUrl(id) });
    } catch (e) {
      return fail(`Not saved: ${(e as Error).message}`);
    }
  });

  server.registerTool('create_topic', {
    title: 'Create a topic',
    description: 'Add a new topic. Must be a complete topic object (see the connector instructions and an existing topic for the shape). Fails if the id already exists.',
    inputSchema: {
      topic: z.record(z.string(), z.any()).describe('The complete topic object, including id, track and order'),
      note: z.string().optional(),
    },
  }, async ({ topic, note }) => {
    const t = topic as unknown as Topic;
    const hub = await fetchHub(db, teacherId);
    const errors = validateTopic(t, hub);
    if (!errors.length) errors.push(...await duplicatesFor(t));
    if (errors.length) return fail(`Not created. Fix these and try again:\n- ${errors.join('\n- ')}`);
    if (await fetchTopic(db, teacherId, t.id)) return fail(`Topic "${t.id}" already exists. Use update_topic to change it.`);
    const saved = await putTopic(db, teacherId, t, 'mcp', note ?? 'Created');
    return text({ created: true, id: t.id, version: saved.version, url: topicUrl(t.id) });
  });

  server.registerTool('list_revisions', {
    title: 'List topic history',
    description: 'Earlier versions of a topic, newest first: revision id, version, where the change came from, note and time.',
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    const revs = await fetchRevisions(db, teacherId, id);
    return text(revs.map(r => ({ revision_id: r.id, version: r.version, source: r.source, note: r.note, created_at: r.created_at })));
  });

  server.registerTool('restore_revision', {
    title: 'Restore an earlier version',
    description: 'Put a topic back to an earlier revision. The current version is kept as a revision too, so this can be undone.',
    inputSchema: { id: z.string(), revision_id: z.string() },
  }, async ({ id, revision_id }) => {
    const rev = await fetchRevision(db, teacherId, revision_id);
    if (!rev || rev.topic_id !== id) return fail(`No revision ${revision_id} for topic "${id}".`);
    const saved = await putTopic(db, teacherId, rev.data, 'mcp', `Restored version ${rev.version}`);
    // Undo always goes through, but say so if the old version repeats a word or frame another topic now uses.
    const warnings = await duplicatesFor(rev.data);
    return text({ restored: true, id, from_version: rev.version, version: saved.version, url: topicUrl(id),
      ...(warnings.length ? { warnings } : {}) });
  });

  server.registerTool('update_hub', {
    title: 'Update the hub',
    description: 'Replace one hub section: "project", "rules", "soon", "course", "tracks", "phases", "plan" or "interviewBanks" '
      + '(the interview question banks, the whole map keyed by track). '
      + 'The plan is fixed for all speaking topics, so only change it when the teacher explicitly asks. '
      + 'The hub as it was is kept as a revision.',
    inputSchema: {
      key: z.enum(['course', 'project', 'rules', 'soon', 'tracks', 'phases', 'plan', 'interviewBanks']),
      value: z.any(),
      note: z.string().optional().describe('One line describing the change'),
    },
  }, async ({ key, value, note }) => {
    const hub = await fetchHub(db, teacherId);
    if (!hub) return fail('No hub yet. Import one in SpeakFun first.');
    const next = { ...hub, [key]: value } as Hub;
    const errors = validateHub(next);
    if (errors.length) return fail(`Not saved:\n- ${errors.join('\n- ')}`);
    const warnings = key === 'interviewBanks'
      ? [...bankWarnings(next.interviewBanks ?? {}, (await fetchTopics(db, teacherId)).map(r => r.data)),
         ...await orphanedPicks(next.interviewBanks ?? {})]
      : [];
    await saveHubKey(db, teacherId, key, value, 'mcp', note ?? `Updated ${key}`);
    return text({ saved: true, key, ...(warnings.length ? { warnings } : {}) });
  });

  /** Questions on the class's list that the new banks no longer have. */
  async function orphanedPicks(banks: Record<string, InterviewBank>): Promise<string[]> {
    const lists = await fetchInterviewPicks(db, teacherId).catch(() => ({}));
    return Object.values(lists).flatMap(p => {
      const ids = bankIndex(banks[p.track]);
      return p.picks.filter(x => !ids.has(x.questionId)).map(x =>
        `${p.track}: the class's list has ${x.questionId}${x.text ? ` ("${x.text}")` : ''}, which is no longer in the bank. It stays on the list as "removed from bank".`);
    });
  }

  server.registerTool('get_interview_picks', {
    title: 'Get the class\'s interview questions',
    description: 'The questions the class picked from the track\'s interview bank, per round and grouped by the framework that answers them, '
      + 'including questions learners asked for that aren\'t in the bank yet ("requested"). Every interview session follows this list. Read-only.',
    inputSchema: { track: z.string().describe('e.g. "Developer"') },
    annotations: { readOnlyHint: true },
  }, async ({ track }) => {
    const [hub, lists, topics] = await Promise.all([fetchHub(db, teacherId), fetchInterviewPicks(db, teacherId), fetchTopics(db, teacherId)]);
    const bank = hub?.interviewBanks?.[track];
    if (!bank) return fail(`No interview question bank for "${track}". Banks exist for: ${Object.keys(hub?.interviewBanks ?? {}).join(', ') || 'none'}.`);
    const p = withMandatory(lists[track] ?? emptyPicks(track), bank);
    const names = allFrameworkNames(bank, frameworkNames(topics.map(r => r.data), track));
    return text({
      track, updatedAt: p.updatedAt,
      ...(lists[track] ? {} : { note: 'Nothing picked yet: only the mandatory questions are on the list.' }),
      rounds: picksByRound(p, bank).map(r => ({ id: r.round.id, name: r.round.name, questions: r.questions })),
      byFramework: picksByFramework(p, bank, names).map(g => ({ framework: g.framework, label: g.label, questions: g.questions.map(q => q.text) })),
    });
  });

  return server;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const teacherId = process.env.LESSON_MCP_TEACHER_ID;
  if (!tokenOk(token) || !teacherId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const server = buildServer(getAdminClient(), teacherId, req.nextUrl.origin);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // stateless: nothing to keep between requests
    void server.close();
  }
}

// Stateless server: no standalone SSE stream (GET) and no sessions to end (DELETE).
function methodNotAllowed() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}
export { methodNotAllowed as GET, methodNotAllowed as DELETE };
