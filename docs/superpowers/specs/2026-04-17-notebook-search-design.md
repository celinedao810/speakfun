# Notebook Search — Design Spec

**Date:** 2026-04-17  
**Feature:** Search in Notebook page to check if a vocab word or structure pattern already exists in the list

---

## Overview

Add a per-tab search input to the Notebook page (`/learner/notebook`) so learners can quickly check whether a specific vocab word or grammar structure is already in their notebook.

---

## Scope

- Vocab tab: search matches against the `word` field (case-insensitive substring).
- Structures tab: search matches against the `pattern` field (case-insensitive substring).
- All filtering/highlighting is client-side — data is already loaded at mount.

---

## UI Placement

The search input is placed **inside the header card, below the tab switcher**. It is rendered conditionally:

- When `activeTab === 'vocab'`: show the vocab search input (only if vocab data exists).
- When `activeTab === 'structures'`: show the structure search input (only if structure data exists).

Switching tabs does **not** reset the other tab's query — each tab maintains its own independent search state.

---

## State

Add two state values to `NotebookPage`:

```ts
const [vocabQuery, setVocabQuery] = useState('');
const [structureQuery, setStructureQuery] = useState('');
```

Pass the relevant query as a `searchQuery: string` prop to `CourseSection` and `StructureCourseSection`.

---

## Search Input Component

A simple inline input inside the header card:

- Icon: `Search` (lucide-react), left side.
- Placeholder: `"Search vocab…"` or `"Search structures…"` depending on active tab.
- Clear button (`×`) on the right, visible only when the field is non-empty. Clicking it resets the query to `""`.
- No debounce — filtering is synchronous over in-memory data.
- Styled to match existing card aesthetic: small text (`text-xs`/`text-sm`), subtle border, rounded.

---

## Matching & Highlighting Logic

Applied inside `CourseSection` and `StructureCourseSection` when `searchQuery` is non-empty:

### Entry-level matching

- An entry **matches** if its `word` (vocab) or `pattern` (structure) contains `searchQuery` as a case-insensitive substring.
- **Matching entries**: rendered normally. The matched substring within the word/pattern is wrapped in a `<mark>` element styled with an amber highlight (`bg-amber-200 dark:bg-amber-700/50`).
- **Non-matching entries**: rendered at `opacity-40`, no highlight.

### Course section behaviour during search

- Course sections with **at least one match**: auto-expand (override the `open` toggle to `true`), show all entries with matching ones highlighted and non-matching ones dimmed.
- Course sections with **zero matches**: hidden entirely.

### Tab-level "no results"

- If every course section is hidden (zero matches across the whole tab): display a single "No results found" message in place of all course sections.

### Empty query

- `searchQuery === ""`: all existing behaviour unchanged — no dimming, no highlighting, no auto-expand override.

---

## Component Changes

| Component | Change |
|---|---|
| `NotebookPage` | Add `vocabQuery`, `structureQuery` state; render search input in header card below tab switcher; pass query to course sections |
| `CourseSection` | Accept `searchQuery: string` prop; apply highlight/dim logic to entries; hide self when zero matches; auto-expand when query active |
| `StructureCourseSection` | Same as above, matching against `pattern` instead of `word` |
| `WordCard` | Accept optional `highlight?: string` prop; render matched substring in `<mark>` |
| `StructureCard` | Accept optional `highlight?: string` prop; render matched substring in `<mark>` |

All changes are confined to `src/app/learner/notebook/page.tsx`. No new files required.

---

## Out of Scope

- Searching `clue`, `exampleSentence`, or `explanation` fields.
- Server-side search or API changes.
- Debouncing.
- Persistent search state across page navigations.
