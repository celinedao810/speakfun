import { SupabaseClient } from '@supabase/supabase-js';
import { InterviewQA, InterviewSession, DrillSession, LiveInterviewSession } from '@/lib/types';

// ============================================================
// Interview QA
// ============================================================

export async function fetchInterviewQA(
  supabase: SupabaseClient,
  learnerId: string
): Promise<InterviewQA[]> {
  const { data, error } = await supabase
    .from('interview_qa')
    .select('*')
    .eq('learner_id', learnerId)
    .order('date_saved', { ascending: false });

  if (error) throw error;

  return (data || []).map(row => ({
    id: row.id,
    question: row.question,
    personalDetails: row.personal_details,
    polishedAnswer: row.polished_answer,
    industry: row.industry,
    role: row.role,
    seniority: row.seniority,
    dateSaved: row.date_saved,
  }));
}

export async function insertInterviewQA(
  supabase: SupabaseClient,
  qa: InterviewQA,
  learnerId: string
): Promise<void> {
  const { error } = await supabase
    .from('interview_qa')
    .upsert({
      id: qa.id,
      learner_id: learnerId,
      question: qa.question,
      personal_details: qa.personalDetails,
      polished_answer: qa.polishedAnswer,
      industry: qa.industry,
      role: qa.role,
      seniority: qa.seniority,
      date_saved: qa.dateSaved,
    }, { onConflict: 'id' });

  if (error) throw error;
}

export async function deleteInterviewQA(
  supabase: SupabaseClient,
  qaId: string
): Promise<void> {
  const { error } = await supabase
    .from('interview_qa')
    .delete()
    .eq('id', qaId);

  if (error) throw error;
}

export async function insertInterviewQAs(
  supabase: SupabaseClient,
  qas: InterviewQA[],
  learnerId: string
): Promise<void> {
  if (qas.length === 0) return;

  const rows = qas.map(qa => ({
    id: qa.id,
    learner_id: learnerId,
    question: qa.question,
    personal_details: qa.personalDetails,
    polished_answer: qa.polishedAnswer,
    industry: qa.industry,
    role: qa.role,
    seniority: qa.seniority,
    date_saved: qa.dateSaved,
  }));

  const { error } = await supabase
    .from('interview_qa')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
}

// ============================================================
// Interview Sessions
// ============================================================

export async function fetchInterviewSessions(
  supabase: SupabaseClient,
  learnerId: string
): Promise<InterviewSession[]> {
  const { data, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('learner_id', learnerId)
    .order('date_created', { ascending: false });

  if (error) throw error;

  return (data || []).map(row => ({
    id: row.id,
    sessionName: row.session_name,
    role: row.role,
    industry: row.industry,
    seniority: row.seniority,
    cvText: row.cv_text,
    jdText: row.jd_text,
    mode: row.mode,
    questions: row.questions,
    dateCreated: row.date_created,
  }));
}

export async function upsertInterviewSession(
  supabase: SupabaseClient,
  session: InterviewSession,
  learnerId: string
): Promise<void> {
  const { error } = await supabase
    .from('interview_sessions')
    .upsert({
      id: session.id,
      learner_id: learnerId,
      session_name: session.sessionName || null,
      role: session.role,
      industry: session.industry,
      seniority: session.seniority,
      cv_text: session.cvText || null,
      jd_text: session.jdText || null,
      mode: session.mode,
      questions: session.questions,
      date_created: session.dateCreated,
    }, { onConflict: 'id' });

  if (error) throw error;
}

export async function deleteInterviewSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  const { error } = await supabase
    .from('interview_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) throw error;
}

export async function insertInterviewSessions(
  supabase: SupabaseClient,
  sessions: InterviewSession[],
  learnerId: string
): Promise<void> {
  if (sessions.length === 0) return;

  const rows = sessions.map(s => ({
    id: s.id,
    learner_id: learnerId,
    session_name: s.sessionName || null,
    role: s.role,
    industry: s.industry,
    seniority: s.seniority,
    cv_text: s.cvText || null,
    jd_text: s.jdText || null,
    mode: s.mode,
    questions: s.questions,
    date_created: s.dateCreated,
  }));

  const { error } = await supabase
    .from('interview_sessions')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
}

// ============================================================
// Drill Sessions
// ============================================================

export async function fetchDrillSessions(
  supabase: SupabaseClient,
  learnerId: string
): Promise<DrillSession[]> {
  const { data, error } = await supabase
    .from('drill_sessions')
    .select('*')
    .eq('learner_id', learnerId)
    .order('session_date', { ascending: false });

  if (error) throw error;

  return (data || []).map(row => ({
    id: row.id,
    date: row.session_date,
    attempts: row.attempts,
    averageScore: row.average_score,
    generalFeedback: row.general_feedback,
  }));
}

export async function insertDrillSession(
  supabase: SupabaseClient,
  session: DrillSession,
  learnerId: string
): Promise<void> {
  const { error } = await supabase
    .from('drill_sessions')
    .upsert({
      id: session.id,
      learner_id: learnerId,
      session_date: session.date,
      attempts: session.attempts,
      average_score: session.averageScore,
      general_feedback: session.generalFeedback,
    }, { onConflict: 'id' });

  if (error) throw error;
}

export async function insertDrillSessions(
  supabase: SupabaseClient,
  sessions: DrillSession[],
  learnerId: string
): Promise<void> {
  if (sessions.length === 0) return;

  const rows = sessions.map(s => ({
    id: s.id,
    learner_id: learnerId,
    session_date: s.date,
    attempts: s.attempts,
    average_score: s.averageScore,
    general_feedback: s.generalFeedback,
  }));

  const { error } = await supabase
    .from('drill_sessions')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
}

// ============================================================
// Live Interview Sessions
// ============================================================

export async function fetchLiveInterviewSessions(
  supabase: SupabaseClient,
  learnerId: string
): Promise<LiveInterviewSession[]> {
  const { data, error } = await supabase
    .from('live_interview_sessions')
    .select('*')
    .eq('learner_id', learnerId)
    .order('session_date', { ascending: false });

  if (error) throw error;

  return (data || []).map(row => ({
    id: row.id,
    qaIds: row.qa_ids,
    turns: row.turns,
    overallFeedback: row.overall_feedback,
    averageScore: row.average_score,
    date: row.session_date,
    role: row.role,
    industry: row.industry,
  }));
}

export async function insertLiveInterviewSession(
  supabase: SupabaseClient,
  session: LiveInterviewSession,
  learnerId: string
): Promise<void> {
  const { error } = await supabase
    .from('live_interview_sessions')
    .upsert({
      id: session.id,
      learner_id: learnerId,
      qa_ids: session.qaIds,
      turns: session.turns,
      overall_feedback: session.overallFeedback || null,
      average_score: session.averageScore || null,
      role: session.role,
      industry: session.industry,
      session_date: session.date,
    }, { onConflict: 'id' });

  if (error) throw error;
}

export async function insertLiveInterviewSessions(
  supabase: SupabaseClient,
  sessions: LiveInterviewSession[],
  learnerId: string
): Promise<void> {
  if (sessions.length === 0) return;

  const rows = sessions.map(s => ({
    id: s.id,
    learner_id: learnerId,
    qa_ids: s.qaIds,
    turns: s.turns,
    overall_feedback: s.overallFeedback || null,
    average_score: s.averageScore || null,
    role: s.role,
    industry: s.industry,
    session_date: s.date,
  }));

  const { error } = await supabase
    .from('live_interview_sessions')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
}
