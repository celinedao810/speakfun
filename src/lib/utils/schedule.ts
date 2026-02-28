import { ScheduleConfig } from '@/lib/types';

interface LessonInput {
  courseId: string;
  lessonId: string;
}

export interface SessionDateMapping {
  courseId: string;
  lessonId: string;
  sessionDate: string;       // "YYYY-MM-DD"
  sessionNumber: number;     // 1-based
}

/**
 * Generate session dates by iterating from startDate forward,
 * only counting days whose JS getDay() is in weekdays[].
 * One session per lesson, in the order lessons are provided.
 */
export function generateSessionDates(
  config: ScheduleConfig,
  lessons: LessonInput[]
): SessionDateMapping[] {
  if (lessons.length === 0 || config.weekdays.length === 0) return [];

  const weekdaySet = new Set(config.weekdays);
  const results: SessionDateMapping[] = [];
  const current = new Date(config.startDate + 'T00:00:00');
  let lessonIndex = 0;

  // Safety: cap at 365 iterations to prevent infinite loop
  for (let i = 0; i < 365 && lessonIndex < lessons.length; i++) {
    if (weekdaySet.has(current.getDay())) {
      results.push({
        courseId: lessons[lessonIndex].courseId,
        lessonId: lessons[lessonIndex].lessonId,
        sessionDate: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`,
        sessionNumber: lessonIndex + 1,
      });
      lessonIndex++;
    }
    current.setDate(current.getDate() + 1);
  }

  return results;
}
