import { SupabaseClient } from '@supabase/supabase-js';
import type { Hub, StoredTopic, Topic, TopicRevision } from '@/lib/lessonHub/types';

// Used both from the teacher portal (RLS-scoped client) and from the MCP connector
// (service-role client), so every query filters by teacher explicitly.

type Source = 'mcp' | 'web' | 'import';

export async function fetchHub(supabase: SupabaseClient, teacherId: string): Promise<Hub | null> {
  const { data, error } = await supabase
    .from('lesson_hubs').select('data').eq('teacher_id', teacherId).maybeSingle();
  if (error) throw new Error(`Loading hub failed: ${error.message}`);
  return (data?.data as Hub) ?? null;
}

export async function saveHub(supabase: SupabaseClient, teacherId: string, hub: Hub): Promise<void> {
  const { error } = await supabase
    .from('lesson_hubs').upsert({ teacher_id: teacherId, data: hub }, { onConflict: 'teacher_id' });
  if (error) throw new Error(`Saving hub failed: ${error.message}`);
}

export async function fetchTopics(supabase: SupabaseClient, teacherId: string): Promise<StoredTopic[]> {
  const { data, error } = await supabase
    .from('lesson_topics')
    .select('id, track, sort_order, title, data, version, updated_at')
    .eq('teacher_id', teacherId)
    .order('track').order('sort_order');
  if (error) throw new Error(`Loading topics failed: ${error.message}`);
  return (data ?? []) as StoredTopic[];
}

export async function fetchTopic(supabase: SupabaseClient, teacherId: string, id: string): Promise<StoredTopic | null> {
  const { data, error } = await supabase
    .from('lesson_topics')
    .select('id, track, sort_order, title, data, version, updated_at')
    .eq('teacher_id', teacherId).eq('id', id).maybeSingle();
  if (error) throw new Error(`Loading topic failed: ${error.message}`);
  return (data as StoredTopic) ?? null;
}

/** Insert a topic or replace it whole; the previous version is kept as a revision. */
export async function putTopic(
  supabase: SupabaseClient, teacherId: string, topic: Topic, source: Source, note: string | null,
): Promise<StoredTopic> {
  const { data, error } = await supabase.rpc('put_lesson_topic', {
    p_teacher: teacherId, p_id: topic.id, p_data: topic, p_source: source, p_note: note,
  });
  if (error) throw new Error(error.message);
  return data as StoredTopic;
}

/**
 * Merge top-level keys into a topic. The caller must validate the merged result first.
 * With expectedVersion, a write that raced another session fails instead of overwriting it.
 */
export async function patchTopic(
  supabase: SupabaseClient, teacherId: string, id: string, patch: Partial<Topic>,
  expectedVersion: number | null, source: Source, note: string | null,
): Promise<StoredTopic> {
  const { data, error } = await supabase.rpc('patch_lesson_topic', {
    p_teacher: teacherId, p_id: id, p_patch: patch, p_expected_version: expectedVersion,
    p_source: source, p_note: note,
  });
  if (error) throw new Error(error.message);
  return data as StoredTopic;
}

export async function fetchRevisions(
  supabase: SupabaseClient, teacherId: string, topicId: string, limit = 30,
): Promise<TopicRevision[]> {
  const { data, error } = await supabase
    .from('lesson_topic_revisions')
    .select('id, topic_id, data, version, source, note, created_at')
    .eq('teacher_id', teacherId).eq('topic_id', topicId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Loading history failed: ${error.message}`);
  return (data ?? []) as TopicRevision[];
}

export async function fetchRevision(
  supabase: SupabaseClient, teacherId: string, revisionId: string,
): Promise<TopicRevision | null> {
  const { data, error } = await supabase
    .from('lesson_topic_revisions')
    .select('id, topic_id, data, version, source, note, created_at')
    .eq('teacher_id', teacherId).eq('id', revisionId).maybeSingle();
  if (error) throw new Error(`Loading revision failed: ${error.message}`);
  return (data as TopicRevision) ?? null;
}

export async function deleteTopic(supabase: SupabaseClient, teacherId: string, id: string): Promise<void> {
  const { error } = await supabase.from('lesson_topics').delete().eq('teacher_id', teacherId).eq('id', id);
  if (error) throw new Error(`Deleting topic failed: ${error.message}`);
}
