# Product Requirements Document (PRD): SpeakFun

**Product Name:** SpeakFun — English Pronunciation Coach
**Version:** 0.1.0 (MVP)
**Last Updated:** 2026-02-09
**Author:** PYE Team
**Status:** Phase 1 Complete, Phase 2 In Progress

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Goals & Success Metrics](#3-product-goals--success-metrics)
4. [User Roles & Personas](#4-user-roles--personas)
5. [Feature Specifications](#5-feature-specifications)
6. [Phonetic Sound Library](#6-phonetic-sound-library)
7. [AI Integration](#7-ai-integration-gemini-25-flash)
8. [Technical Architecture](#8-technical-architecture)
9. [Design & UX](#9-design--ux)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Development Roadmap](#11-development-roadmap)
12. [Risks & Mitigations](#12-risks--mitigations)
13. [Appendix](#13-appendix)

---

## 1. Executive Summary

SpeakFun is an AI-powered English pronunciation coaching platform designed for Vietnamese learners preparing for professional and interview contexts. The app combines phonetic sound training, AI-driven pronunciation scoring, and mock interview simulation into a single progressive web application (PWA).

**Core Value Proposition:** Personalized, industry-specific English pronunciation training with real-time AI feedback — accessible anywhere as an installable mobile/desktop app.

**Target Users:**
- **Primary:** Vietnamese professionals and job seekers improving English pronunciation for workplace communication and job interviews
- **Secondary:** English teachers managing learner pronunciation development

---

## 2. Problem Statement

Vietnamese English learners face specific phonetic challenges (final consonant clusters, linking sounds, vowel contrasts like /iː/ vs /ɪ/) that generic language apps don't address. Existing solutions lack:

1. **Diagnostic precision** — No placement tests that identify specific phonetic weaknesses
2. **Industry context** — Generic practice content unrelated to learners' actual professional domains
3. **Interview preparation** — No integrated pronunciation coaching for job interview scenarios
4. **Teacher oversight** — Limited tools for teachers to assign and track phonetic focus areas
5. **Vietnamese-specific feedback** — Most tools provide only English feedback, missing L1-specific pronunciation guidance

---

## 3. Product Goals & Success Metrics

### Goals

| # | Goal | Description |
|---|------|-------------|
| G1 | Phonetic mastery | Learners achieve 85%+ pronunciation scores on assigned sounds |
| G2 | Interview readiness | Learners practice and improve pronunciation in realistic interview contexts |
| G3 | Personalization | All content is contextualized to the learner's industry, role, and level |
| G4 | Teacher empowerment | Teachers can assign, monitor, and manage learner pronunciation journeys |
| G5 | Accessibility | PWA installable on any device, works offline for cached content |

### Success Metrics (KPIs)

- Placement test completion rate
- Average pronunciation score improvement over 7-day assignment cycles
- Number of interview sessions completed per learner
- Teacher assignment creation rate
- DAU/MAU ratio (engagement)
- Sound mastery badge acquisition rate

---

## 4. User Roles & Personas

### 4.1 Learner

- **Profile fields:** Full name, age, job title, preferences (purpose, industry, role, CEFR level A1–C2)
- **Capabilities:**
  - Take placement diagnostic test
  - Complete daily pronunciation exercises
  - Practice sound drills
  - Prepare interview Q&A library
  - Run mock interview sessions (drill mode + live mode)
  - View achievements and progress history

### 4.2 Teacher

- **Profile fields:** Full name
- **Capabilities:**
  - Browse the full phonetic sound library (104 sounds)
  - Filter and search sounds by category (Vowels, Consonants, Initial/Final Clusters, Ending Patterns, Linking Patterns)
  - Assign sounds to learners
  - View aggregate learner stats (active tasks, completed badges, learning hours)

---

## 5. Feature Specifications

### 5.1 Authentication & User Management

| Feature | Description |
|---------|-------------|
| **Email/password signup** | Role selection (TEACHER/LEARNER) during registration. Learners provide age + job title |
| **Email/password login** | Standard authentication flow |
| **Route protection** | Middleware redirects unauthenticated users to `/login`; authenticated users away from auth pages |
| **Profile management** | Auto-created on signup via Supabase trigger; includes preferences, placement status |
| **Session persistence** | Supabase SSR cookie-based auth across requests |

**Auth flow:**

```
Signup → Select Role → (If LEARNER: age + job title) → Auto-create profile → Redirect to /
Login → Validate credentials → Redirect to /
```

### 5.2 Placement Diagnostic Test

**Purpose:** Identify each learner's specific phonetic weaknesses to auto-generate a personalized curriculum.

| Step | Description |
|------|-------------|
| **LOADING** | AI generates 3 industry-specific sentences, each targeting different phonetic challenges (vowel contrasts, consonant clusters, fricatives, linking) |
| **RECORDING** | Learner reads each sentence aloud; audio captured via browser MediaRecorder (WebM) |
| **DIAGNOSING** | AI (Gemini 2.5 Flash) analyzes pronunciation against target phonemes |
| **SUMMARY** | Displays `DiagnosticResult`: which phonemes, ending sounds, and linking patterns need work |

**Output:** Auto-generates `Assignment` objects for each identified weakness area.

**Data model:**
- `PlacementSentence { text, focusPhonemes[] }`
- `DiagnosticResult { needsLinking, needsEndingSounds[], needsPhonemes[] }`

### 5.3 Phonetic Exercise System

**Purpose:** Daily structured practice on assigned sounds over a multi-day cycle.

#### 5.3.1 Exercise Types

| Type | Steps | Description |
|------|-------|-------------|
| **PHONETIC_DAY** | Listen → Minimal Pairs Game → Tongue Twister → Short Story | Standard vowel/consonant practice |
| **ENDING_SOUNDS** | 5-step flow | Rules explanation → Pattern recognition → Games → Pronunciation drills |
| **LINKING_SOUNDS** | 5-step flow | Connected speech pattern training |

#### 5.3.2 Exercise Mechanics

- **Audio Playback:** Google Cloud TTS (en-US-Neural2-J voice, 24kHz, 0.9x speaking rate) with normal/slow speed toggle
- **Audio Recording:** Browser WebM recording with configurable max duration
- **AI Scoring:** Gemini evaluates pronunciation, returns score (0–100), word-level highlights, and Vietnamese feedback
- **Mastery Threshold:** 85% required to pass a daily exercise
- **Failure Penalty:** 24-hour lock before retry if score < 85%
- **Games:** Word matching, drag-and-drop categorization, odd-one-out identification

#### 5.3.3 Assignment Model

```
Assignment {
  sound: PhonicSound
  learnerId, durationDays, currentDay
  records: DailyRecord[]        // score per day
  status: ACTIVE | COMPLETED | FAILED
  lockUntil?: timestamp         // 24h lock on failure
  exerciseType: PHONETIC_DAY | ENDING_SOUNDS | LINKING_SOUNDS
}
```

### 5.4 Sound Drill System

**Purpose:** Focused 4-exercise practice on a specific sound, decoupled from the assignment cycle.

| Exercise | Description |
|----------|-------------|
| **WORD_READING** | Display target word with IPA transcription + example sentence; learner reads aloud |
| **MINIMAL_PAIRS** | Listen to 2 audio options; identify which matches the target word (3 rounds) |
| **TONGUE_TWISTER** | Repeat a tongue twister containing the target sound; AI scores pronunciation |
| **SHORT_STORY** | Read a 3-sentence story loaded with the target sound; AI scores pronunciation |
| **SUMMARY** | Overall results with per-exercise scores and aggregate feedback |

**Scoring:** Target-sound-focused evaluation — AI specifically analyzes how well the target phoneme was produced, not general pronunciation.

**Data model:**

```
SoundDrillPack {
  targetSound, targetSoundSymbol, industry
  word: { word, ipa, definition, exampleSentence }
  minimalPairs: MinimalPairItem[]     // 3 pairs
  tongueTwister: { text, occurrences }
  shortStory: { text, occurrences }
}
```

### 5.5 Interview Preparation System

**Purpose:** Comprehensive English interview coaching combining Q&A preparation with pronunciation practice.

#### 5.5.1 Interview Q&A Library

| Feature | Description |
|---------|-------------|
| **Save Q&A pairs** | Store questions with personal details and polished answers |
| **AI answer polishing** | Options: simplify, grammar check, professional tone, expand, etc. |
| **AI question fixing** | Grammar correction for user-written questions |
| **AI suggestions** | Tips and guidance for answering specific questions |
| **Metadata** | Industry, role, seniority level, date saved |

#### 5.5.2 Interview Session Creation

| Feature | Description |
|---------|-------------|
| **Standard mode** | Select industry + role + seniority → AI generates questions |
| **Tailored mode** | Upload CV PDF + Job Description PDF → AI generates targeted questions |
| **Question types** | 3 categories per session: HR/Screening, Hiring Manager, Culture Fit |
| **PDF extraction** | Client-side PDF parsing via pdf.js for CV/JD text extraction |
| **Experience levels** | Entry Level, Junior, Middle, Senior, Team Lead, Middle Manager, C-level |

#### 5.5.3 Sound Drill Mode (Interview)

Practice answering saved Q&A pairs with pronunciation scoring:

- Select questions from library
- Record answers aloud
- AI evaluates pronunciation with word-level highlights
- Session saved with per-question scores and general feedback

#### 5.5.4 Live Interview Mode

Real-time mock interview simulation:

| Feature | Description |
|---------|-------------|
| **Question playback** | TTS reads the interview question aloud |
| **Response recording** | Learner answers verbally |
| **AI evaluation** | Per-response scoring across 4 dimensions: pronunciation, grammar, fluency (linking/speed/intonation), general |
| **Word highlighting** | Content words highlighted as correct/incorrect |
| **Hint system** | Option to view bullet points or full polished answer before answering |
| **Session summary** | Overall score, per-question breakdown, complete history |

**Data model:**

```
LiveTurn {
  question, transcription, audioUrl, score
  feedback: { pronunciation, grammar, fluency, general }
  highlights: WordHighlight[]
}

LiveInterviewSession {
  qaIds[], turns[], overallFeedback
  averageScore, role, industry, date
}
```

### 5.6 Teacher Dashboard

| Feature | Description |
|---------|-------------|
| **Sound library browser** | Paginated view (15/page) of all 104 phonetic sounds |
| **Category filtering** | Vowels, Consonants, Initial Clusters, Final Clusters, Ending Patterns, Linking Patterns |
| **Search** | Text search across sound symbols and descriptions |
| **Sound assignment** | Assign specific sounds to learners for practice |
| **Quick stats** | Active tasks count, completed badges, total learning hours |

### 5.7 Achievement System

| Feature | Description |
|---------|-------------|
| **Badges** | Earned when a sound assignment is completed with mastery |
| **Data** | `Achievement { id, soundSymbol, dateEarned }` |
| **Display** | Badge wall on learner dashboard with sound symbols and dates |

---

## 6. Phonetic Sound Library

**Total sounds: 104** organized into 6 categories:

| Category | Count | Examples |
|----------|-------|---------|
| **Vowels** (monophthongs + diphthongs) | 20 | /iː/, /ɪ/, /æ/, /eɪ/, /aɪ/ |
| **Consonants** | 24 | /p/, /b/, /θ/, /ð/, /ʃ/, /tʃ/ |
| **Initial Clusters** | 24 | /bl/, /br/, /fl/, /str/, /skr/ |
| **Final Clusters** | 15 | /pt/, /kt/, /nd/, /lts/, /mps/ |
| **Ending Patterns** | 2 | -s/-es endings, -ed endings |
| **Linking Patterns** | 1+ | Connected speech patterns |

Each sound: `PhonicSound { id, symbol, type, description, patternGroup? }`

---

## 7. AI Integration (Gemini 2.5 Flash)

### 7.1 AI Functions

| Function | Input | Output |
|----------|-------|--------|
| `generatePlacementSentences()` | industry, role | 3 sentences with focusPhonemes |
| `analyzePlacementDiagnostic()` | audio recordings | DiagnosticResult |
| `generateDailyPack()` | sound, industry, role | ExercisePack (words, pairs, twisters, stories) |
| `generateEndingSoundPack()` | pattern, industry | EndingSoundPack |
| `generateLinkingSoundPack()` | industry, role | LinkingSoundPack |
| `generateSoundDrillPack()` | sound, industry | SoundDrillPack |
| `scorePronunciation()` | audio, target text | score, feedback, highlights |
| `scoreTargetSoundPronunciation()` | audio, target sound | targetSoundScore, feedback |
| `generateInterviewQuestions()` | industry, role, seniority, CV/JD | Questions by type |
| `polishInterviewAnswer()` | question, answer, options | Polished answer |
| `evaluateLiveResponse()` | audio, question, answer | Multi-dimensional feedback |
| `fixUserQuestions()` | question text | Grammar-corrected text |
| `getAISuggestion()` | question | Tips and guidance |

### 7.2 Error Handling

- Exponential backoff retry: 2s → 4s → 8s → 16s (4 retries max)
- 429 rate limit detection with user-friendly Vietnamese error messages
- 5xx server error handling

### 7.3 Audio Pipeline

```
User speaks → MediaRecorder (WebM) → base64 encode → Gemini API
                                                          ↓
                                                   Score + Feedback
                                                          ↓
Google Cloud TTS → PCM audio (24kHz) → AudioContext → Playback
```

---

## 8. Technical Architecture

### 8.1 Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16.1.3 (App Router) |
| **UI** | React 19, Tailwind CSS v4, Lucide React icons |
| **Language** | TypeScript 5 (strict mode) |
| **Auth & DB** | Supabase (PostgreSQL + Auth + RLS) |
| **AI** | Google Gemini 2.5 Flash (@google/genai) |
| **TTS** | Google Cloud Text-to-Speech (Neural2-J voice) |
| **PDF** | pdfjs-dist for client-side CV/JD parsing |
| **PWA** | next-pwa with Workbox caching |
| **Deployment** | Vercel (implied by Next.js) |

### 8.2 Data Architecture

**Current state (Phase 1):**
- **Supabase:** User auth + `profiles` table (with RLS policies)
- **localStorage:** All learner progress data, scoped per userId key

**Target state (Phase 2+):**
- **Supabase:** All data migrated to server — assignments, achievements, interview data, drill sessions, live sessions

### 8.3 Key Database Schema

**`profiles` table:**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | References auth.users |
| full_name | TEXT | Required |
| role | TEXT | CHECK: 'TEACHER' or 'LEARNER' |
| age | SMALLINT | Optional (learners) |
| job_title | TEXT | Optional (learners) |
| avatar_url | TEXT | Optional |
| preferences | JSONB | LearnerPreferences object |
| placement_test_done | BOOLEAN | Default false |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto-updated via trigger |

**RLS Policies:**
- Anyone can SELECT profiles (public read)
- Users can only UPDATE/INSERT their own profile

### 8.4 Application Architecture

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx        # Login form
│   │   └── signup/page.tsx       # Signup with role selection
│   ├── api/tts/route.ts          # Google Cloud TTS endpoint
│   ├── layout.tsx                # Root layout (AuthProvider → AppProvider)
│   └── page.tsx                  # Home (role-based: TeacherView | LearnerView)
├── components/
│   ├── Layout.tsx                # Header, footer, user dropdown
│   ├── LearnerView.tsx           # Learner dashboard + sub-view routing
│   ├── TeacherView.tsx           # Teacher dashboard + sound library
│   ├── ExerciseView.tsx          # Multi-step phonetic exercises
│   ├── SoundDrillView.tsx        # 4-exercise sound drill
│   ├── InterviewPrepView.tsx     # Q&A library + session management
│   ├── LiveInterviewView.tsx     # Real-time mock interview
│   ├── PlacementTestView.tsx     # Diagnostic test
│   ├── AudioPlayer.tsx           # TTS playback (normal + slow)
│   └── AudioRecorder.tsx         # Browser audio recording
├── context/
│   ├── AuthContext.tsx            # Supabase auth state
│   └── AppContext.tsx             # Learner progress state (localStorage)
├── lib/
│   ├── types.ts                  # All TypeScript interfaces
│   ├── constants.tsx             # 104 phonetic sounds
│   ├── geminiService.ts          # All AI functions
│   └── supabase/
│       ├── client.ts             # Browser Supabase client
│       ├── server.ts             # Server Supabase client
│       └── middleware.ts         # Auth session management
├── middleware.ts                 # Route protection
```

---

## 9. Design & UX

### 9.1 Design System

| Element | Value |
|---------|-------|
| **Primary color** | Indigo (#4f46e5) |
| **Font** | Inter (400, 500, 600, 700) |
| **Icons** | Lucide React |
| **Corners** | Rounded (border-radius) |
| **Cards** | Border-based with subtle shadows |
| **Layout** | Mobile-first, responsive flex/grid |
| **Dark mode** | Not yet implemented |

### 9.2 Key UX Flows

**Learner Onboarding:**

```
Signup → Set Preferences (purpose, industry, role, level) → Placement Test → Auto-assign sounds → Daily Practice
```

**Daily Practice Loop:**

```
Open Dashboard → Select Active Assignment → Complete Exercise Steps → Score ≥ 85%? →
  YES: Day Complete, next day unlocked
  NO: 24h lock, retry tomorrow
```

**Interview Prep Flow:**

```
Create Q&A Library → Create Session (Standard/Tailored) → Choose Mode:
  → Sound Drill: Practice answers with pronunciation scoring
  → Live Interview: Real-time Q&A simulation with multi-dimensional feedback
```

### 9.3 PWA Configuration

- **Display:** Standalone (full-screen, no browser chrome)
- **Theme:** Indigo (#4f46e5)
- **Icons:** 192x192 and 512x512 PNG
- **Offline:** Workbox service worker for cache strategies
- **Install:** Installable on mobile/desktop

---

## 10. Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| **Browser support** | Modern browsers with MediaRecorder + AudioContext APIs |
| **Audio format** | WebM recording input, LINEAR16 PCM output (TTS) |
| **API resilience** | Exponential backoff (4 retries) for Gemini API calls |
| **Auth security** | Supabase RLS, server-side session validation, middleware protection |
| **Localization** | Vietnamese error messages and pronunciation feedback |
| **Performance** | Client-side audio processing, cached TTS playback |
| **Accessibility** | Not yet addressed — future consideration |

---

## 11. Development Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| **Phase 1** | DONE | Supabase setup, Authentication, Profiles table, Auth UI |
| **Phase 2** | NEXT | Data migration: localStorage → Supabase tables (assignments, achievements, interview data, drill sessions, live sessions) |
| **Phase 3** | Planned | Teacher-learner relationship management, classroom features |
| **Phase 4** | Planned | Advanced analytics and progress reporting |
| **Phase 5** | Planned | Content management system for teachers |
| **Phase 6** | Planned | Notifications and reminders |
| **Phase 7** | Planned | Dark mode, accessibility, internationalization |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Gemini API rate limits / quota exhaustion | Exercises blocked | Exponential backoff, quota monitoring, Vietnamese error messages |
| Client-side localStorage data loss | All learner progress lost | Phase 2 migration to Supabase server storage |
| Browser audio API inconsistencies | Recording failures on some devices | Graceful error handling, supported browser detection |
| Large component sizes (ExerciseView: 82KB) | Maintenance difficulty | Future refactoring into smaller sub-components |
| Gemini API key exposed client-side | Security risk | Migrate to server-side API proxy (future) |
| No automated tests | Regression risk | Implement test suite (future) |

---

## 13. Appendix

### A. Supported Industries (Interview Prep)

Dynamically generated by AI based on learner preferences — no fixed list. Common examples: Technology, Finance, Healthcare, Education, Hospitality, Manufacturing.

### B. CEFR Levels Supported

A1 (Beginner) → A2 → B1 → B2 → C1 → C2 (Proficient)

### C. Environment Variables Required

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client | Supabase anonymous key |
| `NEXT_PUBLIC_GEMINI_API_KEY` | Client | Gemini API key |
| `GEMINI_API_KEY` | Server | Gemini API key (server-side) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Server | GCP service account for TTS |
