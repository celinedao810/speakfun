import type { VoiceChainMode } from './config';

export type CriterionKey = 'coherence' | 'grammar' | 'wordChoice' | 'fluency' | 'pronunciation';

export type ScoreBreakdown = Record<CriterionKey, number>;

export interface VoiceChainFeedback {
  coherence: string;
  grammar: string;
  wordChoice: string;
  fluency: string;
  pronunciation: string;
  tip: string;
  /** Words whose final sound was dropped or unclear. */
  endingSoundIssues: string[];
}

export type MessageStatus = 'open' | 'claimed' | 'answered' | 'expired' | 'removed';

/** A message the recipient has picked up. The letter is only included once confirmed or revealed. */
export interface ClaimView {
  messageId: string;
  senderNickname: string;
  chainPosition: number;
  audioUrl: string | null;
  durationSeconds: number;
  mode: VoiceChainMode;
  claimExpiresAt: string;
  letterOk: boolean;
  letterRevealed: boolean;
  letter: string | null;
  letterAttemptsLeft: number;
  takesLeft: number;
  /** Plays of the message left (counted on the server, so leaving and coming back doesn't reset it). */
  playsLeft: number;
  /** The user picked this message up earlier and is coming back to it. */
  resumed: boolean;
  /** The letters offered in the listening check (the right one plus easy-to-confuse ones). */
  letterChoices: string[];
}

/** Who sent the related message. Other users' recordings are never shared on "My progress". */
export interface ReplyPreview {
  nickname: string;
  durationSeconds: number;
}

/** One of the user's own messages from the last 24h. */
export interface MyMessage {
  id: string;
  isStarter: boolean;
  chainPosition: number;
  createdAt: string;
  expiresAt: string;
  status: MessageStatus;
  audioUrl: string | null;
  durationSeconds: number;
  transcript: string | null;
  requiredLetter: string | null;
  lastLetter: string;
  mode: VoiceChainMode | null;
  letterRevealed: boolean;
  scores: ScoreBreakdown;
  total: number;
  feedback: VoiceChainFeedback | null;
  /** The message this one answered. */
  repliedTo: ReplyPreview | null;
}

export interface DayStats {
  day: string;
  messagesSent: number;
  startersSent: number;
  speakingSeconds: number;
  totalScore: number;
}

export interface StatusResponse {
  nickname: string | null;
  startersLeft: number;
  activeClaim: ClaimView | null;
  today: DayStats;
}

export type RejectReason = 'wrong_letter' | 'too_short' | 'inappropriate' | 'no_last_word';

export type SubmitResponse =
  | { accepted: true; message: MyMessage }
  | {
      accepted: false;
      reason: RejectReason;
      error: string;
      heardWord: string | null;
      transcript: string;
      /** Remaining takes for a reply (null for starters). 0 means the message went back to the pool. */
      takesLeft: number | null;
    };

export interface LetterResponse {
  correct: boolean;
  letterOk: boolean;
  letterRevealed: boolean;
  letter: string | null;
  attemptsLeft: number;
}

export interface LeaderboardRow {
  rank: number;
  nickname: string;
  messagesSent: number;
  speakingSeconds: number;
  totalScore: number;
  isMe: boolean;
}

export interface LeaderboardResponse {
  weekStart: string;
  rows: LeaderboardRow[];
  /** The caller's row when they're outside the top list. */
  me: LeaderboardRow | null;
  /** Messages in the longest chain with a message sent this week (0 if none). */
  longestChain: number;
}

export interface TeacherLearnerStats {
  learnerId: string;
  name: string;
  days: DayStats[];
  messagesSent: number;
  speakingSeconds: number;
  totalScore: number;
  activeDays: number;
}
