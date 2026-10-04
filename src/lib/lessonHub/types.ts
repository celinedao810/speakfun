// E4IT lesson hub data model. Mirrors the data block of the original hub HTML
// (COURSE, PROJECT, GROUPING, PHASES, PLAN, TRACKS, SOON, RULES, TOPICS) so
// topics written for the HTML import unchanged.

export type Group = 'whole' | 'teacher' | 'solo';
export type Phase = string;   // a key of Hub.phases, e.g. 'before' | 'class' | 'after'

export interface Course {
  name: string;
  learner?: string;
  level?: string;
  format?: string;
  promise?: string;
  classSize?: number;
}

export interface Project {
  name: string;
  oneLine: string;
  howItWorks?: string[];
  modules: string[];
  timeline: { wh: string; wt: string }[];
}

export interface ClassRules {
  teacher: string;
  welcome: string;
  rules: { title: string; text: string; note?: string }[];
  reminders: string[];
}

export interface Game {
  mode?: string;
  url: string;
  cta: string;
  note?: string;
  extraUrl?: string;
  extraCta?: string;
}

// Pronunciation round parts
export type PronPart =
  | { kind: 'reveal'; label?: string; tell?: string; chips?: string[]; promptIpa?: boolean; answerIpa?: boolean; perSlide?: number; items: { prompt: string; answer: string }[] }
  | { kind: 'pairs'; label?: string; tell?: string; pairs: { sounds: string; words: [string, string][] }[] }
  | { kind: 'rules'; label?: string; tell?: string; sounds?: { unvoiced: string[]; voiced: string[] }; rules: { ending: string; rows: { sound: string; after: string; ex: string }[] }[] }
  | { kind: 'passage'; label?: string; tell?: string; text: string; marks?: { word: string; sound: string }[] }
  | { kind: 'text'; label?: string; tell?: string; text: string }
  | { kind: 'choice'; label?: string; tell?: string; items: { word: string; note?: string; link: string; options: string[]; correct: number }[] }
  | { kind: 'twisters'; label?: string; tell?: string; items: { text: string; ipa: string }[] }
  | { kind: 'dictation'; label?: string; tell?: string; chips: string[]; perSlide?: number; items: { prompt: string; answer: string }[] };

export type RoundUses =
  | 'context' | 'vocabTable' | 'vocabulary' | 'structures' | 'prompts' | 'dialogue'
  | 'speaking' | 'homework' | 'leadIn' | 'prep' | 'reading';

export interface PlanRound {
  phase: Phase;
  title: string;
  min: number;
  group: Group;
  ctx?: 'own' | 'shared';
  ctxLabel?: string;
  uses?: RoundUses;
  how?: string;
  tell?: string;
  say?: string;
  // pronunciation rounds
  parts?: PronPart[];
  game?: Game;
}

export interface Hub {
  course: Course;
  project: Project;
  grouping: Record<string, number | null>;
  phases: Record<string, { title: string; blurb?: string }>;
  plan: PlanRound[];               // the fixed plan shared by every speaking topic
  tracks: string[];
  soon: Record<string, [number, string][]>;
  rules: ClassRules;
}

export interface VocabItem { word: string; pos: string; definition: string; example: string }
export interface Structure { structure: string; intent: string; example: string; alternative?: string; promptSlots?: string }
export interface Move { name: string; purpose: string; frames: number[] }
export interface Scene { name: string | null; setting: string | null; moves: Move[] }
export interface Gap { text: string; frame: number }
export interface DialogueLine { role: string; text: string; scene?: number; part?: string; gaps?: Gap[] }
export interface Dialogue { context: string; roles: string[]; lines: DialogueLine[] }
export interface Speaking { scenario: string; roles: { name: string; tasks: string[] }[] }

export interface FlowBlock {
  t: 'logo' | 'h' | 'p' | 'input' | 'btn' | 'link' | 'or' | 'acct' | 'list' | 'row' | 'spin' | 'cards';
  text?: string;
  sub?: string;
  primary?: boolean;
  icon?: string;
  click?: boolean;
  items?: (string | FlowBlock)[];
}
export interface FlowStep {
  url?: string;
  caption?: string;
  hold?: number;
  page?: FlowBlock[];
  popup?: { url?: string; blocks: FlowBlock[] };
}
export interface Flow { title?: string; steps: FlowStep[] }

export interface Topic {
  id: string;
  track: string;
  order: number;
  title: string;
  meeting: string;
  anchor: string;
  cefr: string;
  taughtOn?: string;
  says: string;
  // speaking topics
  context?: string | string[];
  reading?: { title: string; passage: string[] };
  leadIn?: string[];
  vocabulary?: VocabItem[];
  structures?: Structure[];
  comprehension?: { q: string; a: string }[];
  speaking?: Speaking;
  homework?: string;
  dialogue?: Dialogue;
  scenes?: Scene[];
  moves?: Move[];
  flow?: Flow;
  // pronunciation sessions carry their own rounds instead of the shared plan
  rounds?: PlanRound[];
  soundNotes?: string[];
}

export interface StoredTopic {
  id: string;
  track: string;
  sort_order: number;
  title: string;
  data: Topic;
  version: number;
  updated_at: string;
}

export interface TopicRevision {
  id: string;
  topic_id: string;
  data: Topic;
  version: number;
  source: 'mcp' | 'web' | 'import';
  note: string | null;
  created_at: string;
}
