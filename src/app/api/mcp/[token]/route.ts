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
import type { Hub, InterviewBank, InterviewSelection, Topic } from '@/lib/lessonHub/types';
import { topicKind } from '@/lib/lessonHub/engine';
import { bankIndex, emptySelection, flagLabels, flagsFor, frameworkNames, resolveRounds, withMandatory } from '@/lib/lessonHub/interview';
import {
  fetchHub, fetchRevision, fetchRevisions, fetchTopic, fetchTopics, patchTopic, putTopic, saveHubKey,
} from '@/lib/supabase/queries/lessonHub';
import { fetchInterviewSelections } from '@/lib/supabase/queries/interviewSelections';

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
The question bank is shared by the whole interview series of a track: get_hub → interviewBanks[track] = {intake:[{key,label,required}],
rounds:[{id, name, pick, usesIntake?, groups:[{id, name, framework?, questions:[{id, text, mandatory?, slots?:[{name, fromIntake?}],
framework?}]}]}]}. Save it with update_hub key "interviewBanks" (the whole map). Question ids are permanent once learners have picked them:
add new ids rather than reusing one, and update_hub warns about learners whose picks a change would orphan.
Learners' picks, project intake and the teacher's extra questions are learner data, read-only here: use list_classes to find a class,
then get_interview_selections to prepare model answers and follow-up questions for later sessions.`;

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

  /** Learners whose picks point at a question id the new banks no longer have. */
  async function orphanedPicks(banks: Record<string, InterviewBank>): Promise<string[]> {
    const { data, error } = await db.from('interview_selections')
      .select('class_id, learner_id, track, picks').eq('teacher_id', teacherId);
    if (error || !data?.length) return [];
    const hits = data.flatMap(r => {
      const ids = bankIndex(banks[r.track]);
      const gone = ((r.picks ?? []) as InterviewSelection['picks']).filter(p => !ids.has(p.questionId)).map(p => p.questionId);
      return gone.length ? [{ ...r, gone }] : [];
    });
    if (!hits.length) return [];
    const [names, classes] = await Promise.all([
      learnerNames(hits.map(h => h.learner_id)),
      db.from('classes').select('id, name').in('id', [...new Set(hits.map(h => h.class_id))]),
    ]);
    const cls = new Map((classes.data ?? []).map(c => [c.id as string, c.name as string]));
    return hits.map(h => `${names.get(h.learner_id) ?? h.learner_id} (${cls.get(h.class_id) ?? h.class_id}, ${h.track}) picked `
      + `${h.gone.join(', ')}, no longer in the bank. Their picks are kept and shown as "(removed from bank)".`);
  }

  async function learnerNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const { data } = await db.from('profiles').select('id, full_name').in('id', [...new Set(ids)]);
    return new Map((data ?? []).map(p => [p.id as string, (p.full_name as string) || 'Unknown']));
  }

  server.registerTool('list_classes', {
    title: 'List classes',
    description: 'The teacher\'s classes: id, name, the lesson-hub track the class follows (null if not set) and number of learners.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const { data, error } = await db.from('classes').select('id, name, track, student_count')
      .eq('teacher_id', teacherId).order('created_at', { ascending: false });
    if (error) return fail(`Loading classes failed: ${error.message}`);
    return text((data ?? []).map(c => ({ id: c.id, name: c.name, track: c.track ?? null, learners: c.student_count })));
  });

  server.registerTool('get_interview_selections', {
    title: 'Get interview picks',
    description: 'Per learner: the project intake, the questions picked in each round (text already filled from the learner\'s project), '
      + 'the framework that answers each, the teacher\'s requested and follow-up questions (follow-ups carry parentId, the question they follow), '
      + 'and flags (intake missing, slots to fill, intake changed). For one learner, one class, or every class on the track. Read-only.',
    inputSchema: {
      track: z.string().describe('e.g. "Developer"'),
      classId: z.string().optional().describe('From list_classes; omit for every class on the track'),
      learnerId: z.string().optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ track, classId, learnerId }) => {
    const hub = await fetchHub(db, teacherId);
    const bank = hub?.interviewBanks?.[track];
    if (!bank) return fail(`No interview question bank for "${track}". Banks exist for: ${Object.keys(hub?.interviewBanks ?? {}).join(', ') || 'none'}.`);
    const [sels, topics, classesRes] = await Promise.all([
      fetchInterviewSelections(db, teacherId, { track, classId, learnerId }),
      fetchTopics(db, teacherId),
      db.from('classes').select('id, name, track').eq('teacher_id', teacherId),
    ]);
    if (classesRes.error) return fail(`Loading classes failed: ${classesRes.error.message}`);
    const withPicks = new Set(sels.map(s => s.classId));
    const classes = (classesRes.data ?? []).filter(c => classId ? c.id === classId : (c.track === track || withPicks.has(c.id)));
    if (classId && !classes.length) return fail(`No class "${classId}". Use list_classes.`);
    const { data: enrolled, error } = classes.length
      ? await db.from('class_enrollments').select('class_id, learner_id').in('class_id', classes.map(c => c.id))
      : { data: [], error: null };
    if (error) return fail(`Loading learners failed: ${error.message}`);
    const names = await learnerNames([...(enrolled ?? []).map(e => e.learner_id as string), ...sels.map(s => s.learnerId)]);
    const fwNames = frameworkNames(topics.map(r => r.data), track);

    const out = classes.map(c => {
      const enrolledIds = (enrolled ?? []).filter(e => e.class_id === c.id).map(e => e.learner_id as string);
      const ids = [...new Set([...enrolledIds, ...sels.filter(s => s.classId === c.id).map(s => s.learnerId)])]
        .filter(id => !learnerId || id === learnerId);
      return {
        classId: c.id, className: c.name,
        learners: ids.map(id => {
          const sel = withMandatory(sels.find(s => s.classId === c.id && s.learnerId === id) ?? emptySelection(c.id, id, track), bank);
          return {
            learnerId: id, name: names.get(id) ?? 'Unknown',
            ...(enrolledIds.includes(id) ? {} : { enrolled: false }),
            intake: sel.intake, intakeUpdatedAt: sel.intakeUpdatedAt,
            flags: flagLabels(flagsFor(sel, bank)),
            rounds: resolveRounds(sel, bank),
            updatedAt: sel.updatedAt,
          };
        }),
      };
    }).filter(c => c.learners.length || !learnerId);
    return text({ track, frameworks: fwNames, classes: out });
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
