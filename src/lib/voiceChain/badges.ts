/**
 * Voice Chain badges. Everything is derived from the message history (no extra
 * tables): the server returns BadgeStats, and evaluateBadges() decides what's earned.
 */

export interface BadgeStats {
  messages: number;
  speakingSeconds: number;
  totalScore: number;
  bestScore: number;
  /** Replies where the letter was picked without having it revealed. */
  sharpEars: number;
  /** Replies recorded in Real talk mode. */
  realTalk: number;
  /** Consecutive days (UTC+7) with at least one message, ending today or yesterday. */
  currentStreak: number;
  longestStreak: number;
}

export type BadgeGroup = 'streak' | 'messages' | 'speaking' | 'score' | 'ears' | 'realtalk';
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface BadgeDef {
  id: string;
  group: BadgeGroup;
  tier: BadgeTier;
  title: string;
  description: string;
  metric: keyof BadgeStats;
  goal: number;
}

export const BADGE_GROUPS: { group: BadgeGroup; label: string }[] = [
  { group: 'streak', label: 'Streaks' },
  { group: 'messages', label: 'Messages' },
  { group: 'speaking', label: 'Speaking time' },
  { group: 'score', label: 'Scores' },
  { group: 'ears', label: 'Good listener' },
  { group: 'realtalk', label: 'Quick replier' },
];

export const BADGES: BadgeDef[] = [
  // Streaks (longest run of days with at least one message)
  { id: 'streak-3', group: 'streak', tier: 'bronze', title: 'Warming up', description: 'Speak 3 days in a row', metric: 'longestStreak', goal: 3 },
  { id: 'streak-7', group: 'streak', tier: 'bronze', title: 'One-week streak', description: 'Speak 7 days in a row', metric: 'longestStreak', goal: 7 },
  { id: 'streak-14', group: 'streak', tier: 'silver', title: 'Two-week streak', description: 'Speak 14 days in a row', metric: 'longestStreak', goal: 14 },
  { id: 'streak-21', group: 'streak', tier: 'silver', title: 'Three-week streak', description: 'Speak 21 days in a row', metric: 'longestStreak', goal: 21 },
  { id: 'streak-30', group: 'streak', tier: 'gold', title: 'One-month streak', description: 'Speak 30 days in a row', metric: 'longestStreak', goal: 30 },
  { id: 'streak-60', group: 'streak', tier: 'gold', title: 'Two-month streak', description: 'Speak 60 days in a row', metric: 'longestStreak', goal: 60 },
  { id: 'streak-100', group: 'streak', tier: 'platinum', title: '100-day legend', description: 'Speak 100 days in a row', metric: 'longestStreak', goal: 100 },

  // Messages sent (starters + replies)
  { id: 'messages-1', group: 'messages', tier: 'bronze', title: 'First words', description: 'Send your first message', metric: 'messages', goal: 1 },
  { id: 'messages-10', group: 'messages', tier: 'bronze', title: 'Chatterbox', description: 'Send 10 messages', metric: 'messages', goal: 10 },
  { id: 'messages-50', group: 'messages', tier: 'silver', title: 'Storyteller', description: 'Send 50 messages', metric: 'messages', goal: 50 },
  { id: 'messages-100', group: 'messages', tier: 'gold', title: 'Conversationalist', description: 'Send 100 messages', metric: 'messages', goal: 100 },
  { id: 'messages-250', group: 'messages', tier: 'gold', title: 'Voice of SpeakFun', description: 'Send 250 messages', metric: 'messages', goal: 250 },
  { id: 'messages-500', group: 'messages', tier: 'platinum', title: 'Unstoppable', description: 'Send 500 messages', metric: 'messages', goal: 500 },

  // Total speaking time
  { id: 'speaking-10m', group: 'speaking', tier: 'bronze', title: 'Warm voice', description: 'Speak for 10 minutes in total', metric: 'speakingSeconds', goal: 10 * 60 },
  { id: 'speaking-20m', group: 'speaking', tier: 'bronze', title: 'Finding your voice', description: 'Speak for 20 minutes in total', metric: 'speakingSeconds', goal: 20 * 60 },
  { id: 'speaking-30m', group: 'speaking', tier: 'bronze', title: 'Half an hour', description: 'Speak for 30 minutes in total', metric: 'speakingSeconds', goal: 30 * 60 },
  { id: 'speaking-1h', group: 'speaking', tier: 'silver', title: 'Hour of talk', description: 'Speak for 1 hour in total', metric: 'speakingSeconds', goal: 60 * 60 },
  { id: 'speaking-2h', group: 'speaking', tier: 'silver', title: 'Talk show host', description: 'Speak for 2 hours in total', metric: 'speakingSeconds', goal: 2 * 60 * 60 },
  { id: 'speaking-5h', group: 'speaking', tier: 'gold', title: 'Marathon speaker', description: 'Speak for 5 hours in total', metric: 'speakingSeconds', goal: 5 * 60 * 60 },
  { id: 'speaking-10h', group: 'speaking', tier: 'platinum', title: 'Golden voice', description: 'Speak for 10 hours in total', metric: 'speakingSeconds', goal: 10 * 60 * 60 },

  // Scores
  { id: 'best-80', group: 'score', tier: 'silver', title: 'Smooth talker', description: 'Score 4 or more on one message', metric: 'bestScore', goal: 4 },
  { id: 'best-90', group: 'score', tier: 'gold', title: 'Silver tongue', description: 'Score a perfect 5 on one message', metric: 'bestScore', goal: 5 },
  { id: 'total-1000', group: 'score', tier: 'bronze', title: '50 points', description: 'Earn 50 points in total', metric: 'totalScore', goal: 50 },
  { id: 'total-10000', group: 'score', tier: 'platinum', title: '500 points', description: 'Earn 500 points in total', metric: 'totalScore', goal: 500 },

  // Good listener: replies where the starting letter was found without "Show me the letter"
  { id: 'ears-10', group: 'ears', tier: 'bronze', title: 'Sharp ears', description: 'Find the starting letter by yourself in 10 replies', metric: 'sharpEars', goal: 10 },
  { id: 'ears-50', group: 'ears', tier: 'gold', title: 'Eagle ears', description: 'Find the starting letter by yourself in 50 replies', metric: 'sharpEars', goal: 50 },

  // Quick replier: replies recorded in Real talk mode
  { id: 'realtalk-10', group: 'realtalk', tier: 'silver', title: 'Quick thinker', description: 'Answer 10 messages in Real talk mode', metric: 'realTalk', goal: 10 },
  { id: 'realtalk-50', group: 'realtalk', tier: 'gold', title: 'Real talker', description: 'Answer 50 messages in Real talk mode', metric: 'realTalk', goal: 50 },
];

export interface BadgeState extends BadgeDef {
  earned: boolean;
  value: number;
}

export function evaluateBadges(stats: BadgeStats): BadgeState[] {
  return BADGES.map(b => {
    const value = stats[b.metric];
    return { ...b, value, earned: value >= b.goal };
  });
}

function shift(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Current and longest runs of consecutive active days. `today` is the UTC+7 date. */
export function computeStreaks(activeDays: string[], today: string): { current: number; longest: number } {
  const days = [...new Set(activeDays)].sort();
  const set = new Set(days);

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of days) {
    run = prev && shift(prev, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }

  // A streak is still alive if the user spoke today or yesterday.
  let cursor = set.has(today) ? today : set.has(shift(today, -1)) ? shift(today, -1) : null;
  let current = 0;
  while (cursor && set.has(cursor)) {
    current++;
    cursor = shift(cursor, -1);
  }
  return { current, longest };
}
