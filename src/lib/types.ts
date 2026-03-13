
export type UserRole = 'TEACHER' | 'LEARNER';
export type ExperienceLevel = 'Entry Level' | 'Junior' | 'Middle' | 'Senior' | 'Team Lead' | 'Middle Manager' | 'C-level';
export type QuestionType = 'HR/Screening' | 'Hiring Manager' | 'Culture Fit';
export type ExerciseType = 'PHONETIC_DAY' | 'ENDING_SOUNDS' | 'LINKING_SOUNDS';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  age?: number;
  job_title?: string;
  avatar_url?: string;
  preferences?: LearnerPreferences;
  placement_test_done: boolean;
  created_at: string;
  updated_at: string;
}

export interface LearnerPreferences {
  purpose: string;
  industry: string;
  role: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
}

export interface PlacementSentence {
  text: string;
  focusPhonemes: string[];
}

export interface DiagnosticResult {
  needsLinking: boolean;
  needsEndingSounds: string[]; // e.g., ['s', 'z', 't', 'd']
  needsPhonemes: string[]; // IDs or Symbols of specific clusters/vowels/consonants
}

export interface InterviewQA {
  id: string;
  question: string;
  personalDetails: string;
  polishedAnswer: string;
  industry: string;
  role: string;
  seniority: ExperienceLevel | 'Tailored';
  dateSaved: string;
}

export interface WordHighlight {
  word: string;
  isCorrect: boolean;
}

export interface DrillAttempt {
  qaId: string;
  question: string;
  answer: string;
  score: number;
  feedback: string;
  highlights: WordHighlight[];
  audioBase64?: string;
}

export interface DrillSession {
  id: string;
  date: string;
  attempts: DrillAttempt[];
  averageScore: number;
  generalFeedback: string;
}

export interface InterviewSession {
  id: string;
  sessionName?: string;
  role: string;
  industry: string;
  seniority: ExperienceLevel | 'Tailored';
  cvText?: string;
  jdText?: string;
  mode: 'STANDARD' | 'TAILORED';
  questions: {
    type: QuestionType;
    list: string[];
  }[];
  dateCreated: string;
}

export interface LiveTurn {
  id: string;
  question: string;
  transcription: string;
  audioUrl: string;
  score: number;
  feedback: {
    pronunciation: string;
    grammar: string;
    fluency: string; // Linking, speed, intonation
    general: string;
  };
  highlights: WordHighlight[];
  timestamp: string;
}

export interface LiveInterviewSession {
  id: string;
  qaIds: string[];
  turns: LiveTurn[];
  overallFeedback?: string;
  averageScore?: number;
  date: string;
  role: string;
  industry: string;
}

export interface PhonicSound {
  id: string;
  symbol: string;
  type: 'VOWEL' | 'CONSONANT' | 'INITIAL_CLUSTER' | 'FINAL_CLUSTER' | 'ENDING_PATTERN' | 'LINKING_PATTERN';
  description: string;
  patternGroup?: 'PLURALS' | 'PAST_TENSE' | 'CONSONANT_VOWEL';
}

export interface ExercisePack {
  soundId: string;
  day: number;
  type: ExerciseType;
  content: {
    targetSound: string;
    minimalPairs?: { 
      wordA: string; 
      wordB: string; 
      ipaA: string;
      ipaB: string;
      hasTargetSound: string;
    }[];
    targetWord?: {
      word: string;
      meaning: string;
      partOfSpeech: string;
      ipa: string;
    };
    tongueTwister: string;
    shortStory: string;
    endingSounds?: string[];
    step2Rules?: { rule: string; sound: string; examples: string[] }[];
    step3Game?: { word: string; sound: string }[];
    step4OddOneOut?: { words: string[]; correctIndex: number; patternLabel: string }[];
    linkingRules?: string;
    step1Examples?: { phrase: string; explanation: string }[];
    step2Dictation?: { phrase: string; audioText: string }[];
    step3Build?: { components: string[]; fullSentence: string };
    step4Mastery?: { sentence: string; linkingPoints: string[] };
  };
}

export interface DailyRecord {
  dayNumber: number;
  date: string;
  score: number;
  completed: boolean;
  exerciseScores: Record<string, number>;
}

export interface Assignment {
  id: string;
  sound: PhonicSound;
  learnerId: string;
  durationDays: number;
  startDate: string;
  currentDay: number;
  records: DailyRecord[];
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  lastActivityDate: string | null;
  type: ExerciseType;
  lockUntil?: string; 
}

export interface Achievement {
  id: string;
  soundSymbol: string;
  dateEarned: string;
}

// ============================================================================
// NEW SOUND DRILL TYPES (4-exercise format)
// ============================================================================

// Minimal pair structure for listening exercise
// New design: Show target word, user listens to 2 audio options and picks which matches
export interface MinimalPairItem {
  id: string;
  targetWord: string;         // Word with target sound (displayed to user)
  targetWordIpa: string;      // IPA for target word
  distractorWord: string;     // Confusing word (different sound, not shown)
  distractorWordIpa: string;  // IPA for distractor word
}

// User's answer for a minimal pair (which audio option they selected: 1 or 2)
export interface MinimalPairAnswer {
  pairId: string;
  selectedOption: 1 | 2;      // Which audio option user selected
  isCorrect: boolean;
}

// New 4-exercise pack structure
export interface SoundDrillPack {
  targetSound: string;        // Description (e.g., "voiceless th")
  targetSoundSymbol: string;  // IPA symbol (e.g., "θ")
  industry: string;           // Learner's industry context

  wordExercise: {
    word: string;
    meaning: string;
    partOfSpeech: string;
    ipa: string;
    exampleSentence: string;
  };

  minimalPairsExercise: {
    pairs: MinimalPairItem[];  // Exactly 3 pairs
    instructions: string;
  };

  tongueTwisterExercise: {
    text: string;
    targetSoundOccurrences: number;
  };

  shortStoryExercise: {
    sentences: string[];  // Exactly 3 sentences
    fullText: string;
    targetSoundOccurrences: number;
  };
}

// Target-sound-focused scoring result
export interface TargetSoundResult {
  targetSoundScore: number;  // 0-100, main metric
  feedback: string;          // Vietnamese feedback
  targetSoundInstances: { word: string; isCorrect: boolean; suggestion?: string }[];
}

// Exercise step type for the new 4-exercise flow
export type SoundDrillStep = 'WORD_READING' | 'MINIMAL_PAIRS' | 'TONGUE_TWISTER' | 'SHORT_STORY' | 'SUMMARY';

// Per-exercise result tracking
export interface SoundDrillExerciseResult {
  step: SoundDrillStep;
  score: number;
  attempts: number;
  feedback?: string;
  minimalPairAnswers?: MinimalPairAnswer[];
}

// ============================================================================
// LMS: Course & Lesson types (Phase 3)
// ============================================================================

// ============================================================================
// LMS: Class Management types (Phase 4)
// ============================================================================

export interface ScheduleConfig {
  weekdays: number[];   // JS day-of-week: 0=Sun, 1=Mon, ..., 6=Sat
  startDate: string;    // ISO date string "YYYY-MM-DD"
}

export type SessionStatus = 'UPCOMING' | 'COMPLETED' | 'CANCELLED';

export interface ClassSession {
  id: string;
  class_id: string;
  course_id: string;
  lesson_id: string;
  session_number: number;
  session_date: string;
  status: SessionStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  course_name?: string;
  lesson_title?: string;
}

export interface Class {
  id: string;
  teacher_id: string;
  name: string;
  description: string;
  class_code: string;
  student_count: number;
  schedule_config: ScheduleConfig | null;
  google_meet_url: string;
  created_at: string;
  updated_at: string;
}

export interface ClassEnrollment {
  id: string;
  class_id: string;
  learner_id: string;
  enrolled_at: string;
  // Joined from profiles
  learner_name?: string;
}

export interface ClassCourse {
  id: string;
  class_id: string;
  course_id: string;
  position: number;
  added_at: string;
  // Joined from courses
  course_name?: string;
  lesson_count?: number;
}

export interface Course {
  id: string;
  teacher_id: string;
  name: string;
  description: string;
  lesson_count: number;
  homework_lesson_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
  pdf_path: string | null;
  pdf_file_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearnerProgress {
  id: string;
  name: string;
  preferences?: LearnerPreferences;
  placementTestDone?: boolean;
  assignments: Assignment[];
  achievements: Achievement[];
  interviewPrep: InterviewQA[];
  interviewSessions: InterviewSession[];
  drillSessions: DrillSession[];
  liveInterviewHistory: LiveInterviewSession[];
}

// ============================================================================
// LMS Phase 6: Homework Exercise System
// ============================================================================

// --- Content extracted from lesson PDF (teacher-triggered) ---

export interface VocabItem {
  id: string;
  word: string;
  ipa: string;
  partOfSpeech: string;
  definition: string;
  exampleSentence: string;
  category?: string;
}

export interface StructureItem {
  id: string;
  pattern: string;
  explanation: string;
  exampleSentence: string;
  topic: string;
}

export interface RawDialogueLine {
  index: number;
  speaker: string;
  text: string;
  conversationId: string;
}

export interface ExtractedLessonContent {
  lessonId: string;
  vocabulary: VocabItem[];
  structures: StructureItem[];
  readingPassage: string;
  extractionStatus: 'PENDING' | 'EXTRACTING' | 'DONE' | 'ERROR';
  errorMessage?: string;
  extractedAt?: string;
}

// --- Generated exercise items (stored in lesson_exercises) ---

export interface VocabExerciseItem {
  id: string;
  word: string;
  ipa: string;
  clue: string;            // Reformatted definition without the word
  exampleSentence: string;
  lessonId: string;
}

export interface StructureExerciseItem {
  id: string;
  pattern: string;
  explanation: string;
  exampleSentence: string;
  topic?: string;
  lessonId: string;
}

export interface LessonExercises {
  lessonId: string;
  vocabItems: VocabExerciseItem[];
  structureItems: StructureExerciseItem[];
  readingPassage: string;
  conversationExercise?: ConversationExercise;
  generationStatus: 'PENDING' | 'GENERATING' | 'DONE' | 'ERROR';
  errorMessage?: string;
  generatedAt?: string;
}

// --- Reading exercise types ---

export interface ReadingExerciseItem {
  lessonId: string;
  readingPassage: string;
  vocabWords: VocabExerciseItem[];
}

export interface ReadingScoringResult {
  readingMatches: boolean;
  penaltiesApplied: number;
  mispronunciations: { word: string; issue: string }[];
  vocabResults: { word: string; correct: boolean }[];
  pointsEarned: number;
  feedback: string;
  transcription: string;
}

// --- Conversation exercise types ---

export interface ConversationTurn {
  index: number;
  speaker: 'AI' | 'LEARNER';
  text: string;               // AI: message text; LEARNER: ideal/sample answer
  targetStructureId?: string; // LEARNER turns only
  hint?: string;              // Structure pattern to reveal on hint tap
}

export interface ConversationExercise {
  lessonId: string;
  scenario: string;     // e.g. "Discussing a project update with your manager"
  aiRole: string;       // e.g. "Manager"
  learnerRole: string;  // e.g. "Team Member" (overridden by profile at display time)
  turns: ConversationTurn[];
}

export interface ConversationTurnScoringResult {
  transcription: string;
  structureExact: boolean;    // Used target structure exactly
  structureUsed: boolean;     // Used a similar/correct structure
  grammarCorrect: boolean;
  penaltiesApplied: number;
  pointsEarned: number;       // 10, 5, or 0 minus penalties
  feedback: string;           // Vietnamese
  correctedSentence: string;  // Learner's transcription rewritten with the correct structure
}

// --- Homework windows and settings ---

export interface HomeworkWindow {
  id: string;
  classId: string;
  triggeringSessionId: string | null;
  windowDate: string;           // "YYYY-MM-DD" (UTC+7)
  isReviewSession: boolean;
  lessonIdsInPool: string[];
  maxPossiblePoints: number;
  opensAt: string;              // ISO timestamp
  closesAt: string;             // ISO timestamp
  pendingReadingLessonId: string | null;
  sessionNumber: number;        // sequential counter per class (1, 2, 3, ...)
  lessonCycleSession: number | null; // 1, 2, or 3; null for review sessions
  cycleLessonId: string | null; // which lesson's exercises this session uses; null for review
  createdAt: string;
}

export interface ClassHomeworkSettings {
  id: string;
  classId: string;
  wordsPerSession: number;
  structuresPerSession: number;
  correctGuessesToCommit: number;
  reviewIntervalDays: number;
  reviewWordCount: number;
  reviewStructureCount: number;
  homeworkRestartedAt: string | null;
}

// --- Learner vocab mastery (spaced repetition) ---

export interface VocabMasteryRecord {
  id: string;
  learnerId: string;
  classId: string;
  vocabItemId: string;
  lessonId: string;
  correctCount: number;
  incorrectCount: number;
  isCommitted: boolean;
  lastSeenAt?: string;
  committedAt?: string;
}

// --- Homework submission ---

export interface HomeworkSessionState {
  currentExercise?: 'VOCAB' | 'SENTENCE' | 'CONVERSATION';
  ex1State?: {
    completedVocabIds: string[];
    pendingVocabIds: string[];
    wrongThisSession: string[];
  };
  ex2State?: {
    completedStructureIds: string[];
    currentStructureId?: string;
  };
  ex3State?: {
    completedLineIndices: number[];
    conversationId?: string;
    mode?: 'NEXT' | 'PRIOR';
  };
  // Saved after Ex1 completes so vocab mastery can be updated even when
  // the learner resumes the session after a page refresh.
  vocabAttempts?: VocabAttemptAudit[];
}

export interface HomeworkSubmission {
  id: string;
  learnerId: string;
  windowId: string;
  classId: string;
  ex1Score: number;
  ex2Score: number;
  ex3aScore: number;
  ex3bScore: number;
  totalScore: number;
  ex1Completed: boolean;
  ex2Completed: boolean;
  ex3Completed: boolean;
  allCompleted: boolean;
  wrongVocabIds: string[];
  readingMastered: boolean;
  sessionState: HomeworkSessionState;
  startedAt?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Scoring results ---

export interface VocabScoringResult {
  vocabItemId: string;
  recognizedWord: string;
  isCorrectWord: boolean;
  pronunciationScore: number;
  pointsEarned: number;
  feedback: string;
  highlights: WordHighlight[];
}

export interface VocabAttemptAudit {
  vocabItemId: string;
  lessonId: string;
  targetWord: string;
  recognizedWord: string;
  isCorrectWord: boolean;
  pronunciationScore: number;
  pointsEarned: number;
  feedback: string;
  timedMode: boolean;
  timeTakenMs: number;
  timedOut: boolean;
  attemptTimestamp: string;
}

export interface StructureScoringResult {
  structureItemId: string;
  step: 'READ_EXAMPLE' | 'OWN_SENTENCE';
  pronunciationScore: number;
  grammarCorrect?: boolean;
  pointsEarned: number;
  feedback: string;
  transcription?: string;
  penaltiesApplied: number;
}

export interface ConversationScoringResult {
  isCorrect: boolean;
  pronunciationScore: number;
  transcription: string;
  pointsEarned: number;
  timeTakenMs: number;
}

// --- Leaderboard ---

export interface LeaderboardEntry {
  learnerId: string;
  learnerName: string;
  classId: string;
  sessionsAttended: number;
  homeworkCompleted: number;
  totalPoints: number;
  totalSubmissions: number;
  rank?: number;
}

// --- Lesson Plan Generator ---

export interface LessonPlanSection {
  id: string;      // "objectives" | "warmer" | "vocabulary" | "language" | "activities" | "wrap_up" | "homework"
  heading: string;
  content: string; // markdown text
}

export interface LessonPlanMetadata {
  topic: string;
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  lessonFormat: string;
  learnerPersonas: string;
  otherInstructions: string;
}

export interface GeneratedLessonPlan {
  id: string;
  teacher_id: string;
  title: string;
  content: LessonPlanSection[];
  metadata: LessonPlanMetadata | null;
  created_at: string;
  updated_at: string;
}
