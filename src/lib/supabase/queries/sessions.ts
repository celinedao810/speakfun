import { SupabaseClient } from '@supabase/supabase-js';
import { ClassSession, ScheduleConfig, SessionStatus } from '@/lib/types';
import { generateSessionDates } from '@/lib/utils/schedule';

// ============================================================================
// Fetch sessions
// ============================================================================

export async function fetchClassSessions(
  supabase: SupabaseClient,
  classId: string
): Promise<ClassSession[]> {
  const { data, error } = await supabase
    .from('class_sessions')
    .select('*, courses:course_id(name), lessons:lesson_id(title)')
    .eq('class_id', classId)
    .order('session_number', { ascending: true });

  if (error) {
    console.error('Error fetching class sessions:', error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    class_id: row.class_id as string,
    course_id: row.course_id as string,
    lesson_id: row.lesson_id as string,
    session_number: row.session_number as number,
    session_date: row.session_date as string,
    status: row.status as SessionStatus,
    notes: (row.notes as string) || '',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    course_name: (row.courses as Record<string, unknown>)?.name as string || '',
    lesson_title: (row.lessons as Record<string, unknown>)?.title as string || '',
  }));
}

// ============================================================================
// Bulk insert sessions (after generating dates)
// ============================================================================

export async function insertClassSessions(
  supabase: SupabaseClient,
  sessions: {
    class_id: string;
    course_id: string;
    lesson_id: string;
    session_number: number;
    session_date: string;
  }[]
): Promise<{ success: boolean; error: string | null }> {
  if (sessions.length === 0) return { success: true, error: null };

  const { error } = await supabase
    .from('class_sessions')
    .insert(sessions);

  if (error) {
    console.error('Error inserting sessions:', error);
    return { success: false, error: error.message };
  }
  return { success: true, error: null };
}

// ============================================================================
// Delete all sessions for a class (before regenerating)
// ============================================================================

export async function deleteClassSessions(
  supabase: SupabaseClient,
  classId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('class_sessions')
    .delete()
    .eq('class_id', classId);

  if (error) {
    console.error('Error deleting class sessions:', error);
    return false;
  }
  return true;
}

// ============================================================================
// Update a single session (status or notes)
// ============================================================================

export async function updateSession(
  supabase: SupabaseClient,
  sessionId: string,
  updates: { status?: SessionStatus; notes?: string }
): Promise<boolean> {
  const { error } = await supabase
    .from('class_sessions')
    .update(updates)
    .eq('id', sessionId);

  if (error) {
    console.error('Error updating session:', error);
    return false;
  }
  return true;
}

// ============================================================================
// Update only google_meet_url (Zoom) on the class
// ============================================================================

export async function updateZoomUrl(
  supabase: SupabaseClient,
  classId: string,
  url: string
): Promise<boolean> {
  const { error } = await supabase
    .from('classes')
    .update({ google_meet_url: url })
    .eq('id', classId);

  if (error) {
    console.error('Error updating Zoom URL:', error);
    return false;
  }
  return true;
}

// ============================================================================
// Update schedule_config and google_meet_url on the class
// ============================================================================

export async function updateClassSchedule(
  supabase: SupabaseClient,
  classId: string,
  scheduleConfig: ScheduleConfig | null,
  googleMeetUrl: string
): Promise<boolean> {
  const { error } = await supabase
    .from('classes')
    .update({
      schedule_config: scheduleConfig,
      google_meet_url: googleMeetUrl,
    })
    .eq('id', classId);

  if (error) {
    console.error('Error updating class schedule:', error);
    return false;
  }
  return true;
}

// ============================================================================
// Fetch all lessons for all courses assigned to a class
// (ordered by course position, then lesson sort_order)
// ============================================================================

export async function fetchLessonsForClassCourses(
  supabase: SupabaseClient,
  classId: string
): Promise<{ courseId: string; lessonId: string }[]> {
  // Get assigned courses in position order
  const { data: classCourses, error: ccError } = await supabase
    .from('class_courses')
    .select('course_id')
    .eq('class_id', classId)
    .order('position', { ascending: true });

  if (ccError || !classCourses?.length) return [];

  const courseIds = classCourses.map((cc: { course_id: string }) => cc.course_id);

  // Fetch all lessons for those courses
  const { data: lessons, error: lError } = await supabase
    .from('lessons')
    .select('id, course_id, sort_order')
    .in('course_id', courseIds)
    .order('sort_order', { ascending: true });

  if (lError || !lessons) return [];

  // Sort: by course position first, then lesson sort_order
  const courseOrder = new Map(courseIds.map((id: string, i: number) => [id, i]));
  const sorted = [...lessons].sort((a, b) => {
    const cA = courseOrder.get(a.course_id) ?? 999;
    const cB = courseOrder.get(b.course_id) ?? 999;
    if (cA !== cB) return cA - cB;
    return a.sort_order - b.sort_order;
  });

  return sorted.map((l) => ({ courseId: l.course_id, lessonId: l.id }));
}

// ============================================================================
// Cascade lessons forward (Option 1: move lesson to next sessions)
// ============================================================================

export async function cascadeLessonsForward(
  supabase: SupabaseClient,
  classId: string,
  cancelledSession: ClassSession
): Promise<{ success: boolean; error: string | null }> {
  const allSessions = await fetchClassSessions(supabase, classId);

  const upcomingAfter = allSessions.filter(
    s => s.session_number > cancelledSession.session_number && s.status === 'UPCOMING'
  );

  // Mark cancelled session
  const ok = await updateSession(supabase, cancelledSession.id, { status: 'CANCELLED' });
  if (!ok) return { success: false, error: 'Failed to cancel session.' };

  if (upcomingAfter.length === 0) {
    return { success: true, error: null };
  }

  // Build shifted lessons: cancelled lesson goes first, then each upcoming's original lesson
  const shiftedLessons = [
    { lesson_id: cancelledSession.lesson_id, course_id: cancelledSession.course_id },
    ...upcomingAfter.slice(0, -1).map(s => ({ lesson_id: s.lesson_id, course_id: s.course_id })),
  ];

  const results = await Promise.all(
    upcomingAfter.map((session, i) =>
      supabase
        .from('class_sessions')
        .update({ lesson_id: shiftedLessons[i].lesson_id, course_id: shiftedLessons[i].course_id })
        .eq('id', session.id)
    )
  );

  if (results.some(r => r.error)) {
    return { success: false, error: 'Failed to cascade lessons forward.' };
  }
  return { success: true, error: null };
}

// ============================================================================
// Reschedule a single session to a new date (Option 2)
// ============================================================================

export async function rescheduleSession(
  supabase: SupabaseClient,
  sessionId: string,
  newDate: string
): Promise<boolean> {
  const { error } = await supabase
    .from('class_sessions')
    .update({ session_date: newDate, status: 'UPCOMING' })
    .eq('id', sessionId);

  if (error) {
    console.error('Error rescheduling session:', error);
    return false;
  }
  return true;
}

// ============================================================================
// Reschedule this session + all following sessions (Option 3)
// ============================================================================

export async function rescheduleFollowingSessions(
  supabase: SupabaseClient,
  classId: string,
  fromSessionNumber: number,
  newStartDate: string,
  weekdays: number[]
): Promise<{ success: boolean; error: string | null }> {
  const allSessions = await fetchClassSessions(supabase, classId);

  const toReschedule = allSessions
    .filter(s => s.session_number >= fromSessionNumber)
    .sort((a, b) => a.session_number - b.session_number);

  if (toReschedule.length === 0) {
    return { success: false, error: 'No sessions to reschedule.' };
  }

  const lessons = toReschedule.map(s => ({ courseId: s.course_id, lessonId: s.lesson_id }));
  const newDates = generateSessionDates({ weekdays, startDate: newStartDate }, lessons);

  const results = await Promise.all(
    toReschedule.map((session, i) =>
      supabase
        .from('class_sessions')
        .update({ session_date: newDates[i].sessionDate, status: 'UPCOMING' })
        .eq('id', session.id)
    )
  );

  if (results.some(r => r.error)) {
    return { success: false, error: 'Failed to reschedule sessions.' };
  }
  return { success: true, error: null };
}
